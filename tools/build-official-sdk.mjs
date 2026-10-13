import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readlink,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(
  await readFile(resolve(workspaceRoot, "tools/official-sdk/pin.json"), "utf8"),
);
const cacheRoot =
  process.env.INOCHI2D_SDK_CACHE ??
  join(
    homedir(),
    ".cache",
    "starlite",
    "official-sdk",
    `${pin.sdkCommit}-${pin.toolchainTag}`,
  );
const archives = resolve(cacheRoot, "archives");
const sourceArchive = resolve(archives, `inochi2d-${pin.sdkCommit}.tar.gz`);
const toolchainArchive = resolve(archives, "ldc2-wasm32-wasi.tar.gz");
const sourceRoot = resolve(cacheRoot, `inochi2d-${pin.sdkCommit}`);
const toolchainRoot = resolve(cacheRoot, "ldc2");
const output = resolve(
  workspaceRoot,
  "packages/inochi2d/src/generated/inochi2d.wasm",
);

if (process.platform !== "linux") {
  throw new Error("The official Inochi2D WASM build must run on Linux or WSL.");
}

await mkdir(archives, { recursive: true });
await ensureArchive(pin.sdkSourceUrl, sourceArchive, pin.sdkSourceSha256);
await ensureArchive(pin.toolchainUrl, toolchainArchive, pin.toolchainSha256);
await extractOnce(sourceArchive, sourceRoot);
await extractToolchainOnce(toolchainArchive, toolchainRoot);
await copyFile(
  resolve(workspaceRoot, "tools/official-sdk/dub.selections.json"),
  resolve(sourceRoot, "dub.selections.json"),
);
await enableWasmAllocator(resolve(sourceRoot, "dub.sdl"));
await stabilizeDrawAllocations(
  resolve(sourceRoot, "source/inochi2d/core/render/drawlist.d"),
);
await enableRuntimeBindings(sourceRoot);
await fixCompositeColorDeserialization(
  resolve(sourceRoot, "source/inochi2d/nodes/visual/composite.d"),
);
await fixParameter2dRangeDeserialization(
  resolve(sourceRoot, "source/inochi2d/param/parameters/param2d.d"),
);
await fixParameter1dRangeDeserialization(
  resolve(sourceRoot, "source/inochi2d/param/parameters/param1d.d"),
);
await fixSimplePhysicsOutputScaleDeserialization(
  resolve(sourceRoot, "source/inochi2d/nodes/legacy/simplephysics.d"),
);
await restoreLegacyPropertyLifecycle(
  resolve(sourceRoot, "source/inochi2d/nodes/package.d"),
  resolve(sourceRoot, "source/inochi2d/puppet.d"),
);
await fixSimplePhysicsLocalCoordinates(
  resolve(sourceRoot, "source/inochi2d/nodes/legacy/simplephysics.d"),
);
await enablePhysicsDiagnostics(
  resolve(sourceRoot, "source/inochi2d/cffi.d"),
);
await restrictBrowserExports(
  resolve(sourceRoot, "source/inochi2d/cffi.d"),
  resolve(sourceRoot, "dub.sdl"),
);

const linker = await findFirst([
  "/usr/bin/wasm-ld-20",
  "/usr/bin/wasm-ld",
  "/usr/bin/wasm-ld-19",
]);
if (!linker) {
  throw new Error("wasm-ld was not found; install lld-20 before building the official SDK.");
}
requireToolVersion(linker, ["--version"], /LLD 20\./u, "LLD 20");
requireToolVersion("wasm-opt", ["--version"], /version 120\b/u, "Binaryen 120");
const shimDirectory = resolve(cacheRoot, "bin");
const shimLink = resolve(shimDirectory, "wasm-ld");
await mkdir(shimDirectory, { recursive: true });
await ensureSymlink(linker, shimLink);

const compiler = resolve(toolchainRoot, "bin/ldc2");
const dub = resolve(toolchainRoot, "bin/dub");
const dubHome = resolve(cacheRoot, "dub-home");
await mkdir(dubHome, { recursive: true });
await Promise.all([access(compiler), access(dub)]);
run(
  dub,
  [
    "build",
    `--compiler=${compiler}`,
    "--config=wasm",
    "--arch=wasm32-wasip2",
    "--build=release",
  ],
  sourceRoot,
  {
    DUB_HOME: dubHome,
    PATH: `${shimDirectory}:${process.env.PATH ?? ""}`,
  },
);

const rawWasm = resolve(sourceRoot, "out/inochi2d.wasm");
await requireHash(rawWasm, pin.rawWasmSha256, "official SDK WASM");
const optimized = resolve(sourceRoot, "out/inochi2d.opt.wasm");
run(
  "wasm-opt",
  [
    rawWasm,
    "-Oz",
    "--strip-debug",
    "--strip-dwarf",
    "--strip-producers",
    "-o",
    optimized,
  ],
  sourceRoot,
);
await requireHash(optimized, pin.optimizedWasmSha256, "optimized official SDK WASM");

await mkdir(dirname(output), { recursive: true });
const temporaryOutput = `${output}.tmp-${process.pid}`;
await copyFile(optimized, temporaryOutput);
await rename(temporaryOutput, output);
console.log(`Official Inochi2D WASM staged at ${output}`);

async function ensureArchive(url, destination, expectedHash) {
  try {
    await access(destination);
    await requireHash(destination, expectedHash, destination);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const partial = `${destination}.part-${process.pid}`;
  try {
    await writeFile(partial, new Uint8Array(), { flag: "wx" });
    run(
      "curl",
      [
        "--fail",
        "--location",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--retry-all-errors",
        "--connect-timeout",
        "30",
        "--continue-at",
        "-",
        "--output",
        partial,
        url,
      ],
      cacheRoot,
    );
    await requireHash(partial, expectedHash, url);
    await rename(partial, destination);
  } catch (error) {
    await unlink(partial).catch((cleanupError) => {
      if (cleanupError?.code !== "ENOENT") {
        throw cleanupError;
      }
    });
    throw error;
  }
}

async function extractOnce(archive, expectedDirectory) {
  try {
    await access(resolve(expectedDirectory, "dub.sdl"));
    return;
  } catch {}
  run("tar", ["-xzf", archive, "--warning=no-unknown-keyword", "-C", cacheRoot], cacheRoot);
  await access(resolve(expectedDirectory, "dub.sdl"));
}

async function extractToolchainOnce(archive, expectedDirectory) {
  try {
    await access(resolve(expectedDirectory, "bin/ldc2"));
    return;
  } catch {}
  run("tar", ["-xzf", archive, "--warning=no-unknown-keyword", "-C", cacheRoot], cacheRoot);
  await access(resolve(expectedDirectory, "bin/ldc2"));
}

async function findFirst(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

async function enableWasmAllocator(recipePath) {
  const original =
    '    subConfiguration "nurt" "nurt-enabled"\n' +
    '    copyFiles "tech-docs" "dist/*"';
  const patched =
    '    subConfiguration "nurt" "nurt-enabled"\n' +
    '    dependency "numem:hookset-wasm" version="*"\n' +
    '    copyFiles "tech-docs" "dist/*"';
  const recipe = await readFile(recipePath, "utf8");
  if (recipe.includes(patched)) {
    return;
  }
  if (!recipe.includes(original)) {
    throw new Error("official SDK wasm configuration changed; allocator patch was not applied");
  }
  await writeFile(recipePath, recipe.replace(original, patched));
}

async function stabilizeDrawAllocations(drawListPath) {
  const original =
    "public:\n\n" +
    "    // Destructor\n" +
    "     ~this() {";
  const patched =
    "public:\n\n" +
    "    // Keep allocation cookies stable for the browser compatibility profile.\n" +
    "    // Parts retain pointers returned by allocate(), so growing this vector later\n" +
    "    // would invalidate those pointers. The model pipeline caps nodes at 4096.\n" +
    "    this() {\n" +
    "        _allocs.reserve(4096);\n" +
    "    }\n\n" +
    "    // Destructor\n" +
    "     ~this() {";
  const source = await readFile(drawListPath, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK draw-list layout changed; allocation-stability patch was not applied",
    );
  }
  await writeFile(drawListPath, source.replace(original, patched));
}

async function fixCompositeColorDeserialization(compositePath) {
  const original =
    '        object.tryGetRef(state, tint, "tint");\n' +
    '        object.tryGetRef(state, screenTint, "screenTint");';
  const oldPatched =
    '        // Match Part deserialization: DataNode writes vector elements through\n' +
    '        // the backing array rather than replacing the vector value.\n' +
    '        object.tryGetRef(state, tint.data, "tint");\n' +
    '        object.tryGetRef(state, screenTint.data, "screenTint");';
  const unguardedPatched =
    '        // Legacy grouping composites may omit every visual field. nogc_new\n' +
    '        // does not reliably retain D field initializers, so establish the\n' +
    '        // Creator defaults before reading optional values.\n' +
    '        opacity = 1;\n' +
    '        tint = vec3(1, 1, 1);\n' +
    '        screenTint = vec3(0, 0, 0);\n' +
    '        object.tryGetRef(state, opacity, "opacity");\n' +
    '        // Match Part deserialization: DataNode writes vector elements through\n' +
    '        // the backing array rather than replacing the vector value.\n' +
    '        object.tryGetRef(state, tint.data, "tint");\n' +
    '        object.tryGetRef(state, screenTint.data, "screenTint");';
  const patched =
    '        // Legacy grouping composites may omit every visual field. D float.init\n' +
    '        // is NaN, so preserve explicit Creator defaults when a key is absent.\n' +
    '        opacity = 1;\n' +
    '        tint = vec3(1, 1, 1);\n' +
    '        screenTint = vec3(0, 0, 0);\n' +
    '        if ("opacity" in object)\n' +
    '            object.tryGetRef(state, opacity, "opacity");\n' +
    '        // Match Part deserialization: DataNode writes vector elements through\n' +
    '        // the backing array rather than replacing the vector value.\n' +
    '        if ("tint" in object)\n' +
    '            object.tryGetRef(state, tint.data, "tint");\n' +
    '        if ("screenTint" in object)\n' +
    '            object.tryGetRef(state, screenTint.data, "screenTint");';
  const source = await readFile(compositePath, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (source.includes(unguardedPatched)) {
    await writeFile(
      compositePath,
      source.replace(unguardedPatched, patched),
    );
    return;
  }
  if (source.includes(oldPatched)) {
    const withDefaults = source
      .replace('        object.tryGetRef(state, opacity, "opacity");\n', "")
      .replace(oldPatched, patched);
    await writeFile(compositePath, withDefaults);
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK composite color decoder changed; compatibility patch was not applied",
    );
  }
  await writeFile(
    compositePath,
    source
      .replace('        object.tryGetRef(state, opacity, "opacity");\n', "")
      .replace(original, patched),
  );
}

async function fixParameter2dRangeDeserialization(parameterPath) {
  const original =
    '        object.tryGetRef(state, min, "min");\n' +
    '        object.tryGetRef(state, max, "max");\n' +
    '        object.tryGetRef(state, defaults, "defaults");';
  const patched =
    '        // Fixed-size vectors deserialize through their backing arrays.\n' +
    '        object.tryGetRef(state, min.data, "min");\n' +
    '        object.tryGetRef(state, max.data, "max");\n' +
    '        object.tryGetRef(state, defaults.data, "defaults");';
  const source = await readFile(parameterPath, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK 2D parameter range decoder changed; compatibility patch was not applied",
    );
  }
  await writeFile(parameterPath, source.replace(original, patched));
}

async function fixParameter1dRangeDeserialization(parameterPath) {
  const original =
    '        object.tryGetRef(state, min, "min");\n' +
    '        object.tryGetRef(state, max, "max");\n' +
    '        object.tryGetRef(state, defaults, "defaults");';
  const patched =
    "        // Legacy 0.8 files store scalar ranges in the first element of\n" +
    "        // two-element arrays shared with 2D parameters.\n" +
    "        if (state.doUpgrade08) {\n" +
    '            auto minimum = "min" in object;\n' +
    "            if (minimum && (*minimum).isArray)\n" +
    "                (*minimum).tryGetRef(state, min, 0);\n" +
    "            else\n" +
    '                object.tryGetRef(state, min, "min");\n' +
    '            auto maximum = "max" in object;\n' +
    "            if (maximum && (*maximum).isArray)\n" +
    "                (*maximum).tryGetRef(state, max, 0);\n" +
    "            else\n" +
    '                object.tryGetRef(state, max, "max");\n' +
    '            auto defaultValues = "defaults" in object;\n' +
    "            if (defaultValues && (*defaultValues).isArray)\n" +
    "                (*defaultValues).tryGetRef(state, defaults, 0);\n" +
    "            else\n" +
    '                object.tryGetRef(state, defaults, "defaults");\n' +
    "        } else {\n" +
    '            object.tryGetRef(state, min, "min");\n' +
    '            object.tryGetRef(state, max, "max");\n' +
    '            object.tryGetRef(state, defaults, "defaults");\n' +
    "        }";
  const source = await readFile(parameterPath, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK 1D parameter range decoder changed; compatibility patch was not applied",
    );
  }
  await writeFile(parameterPath, source.replace(original, patched));
}

async function fixSimplePhysicsOutputScaleDeserialization(physicsPath) {
  const outputOriginal =
    '        object.tryGetRef(state, outputScale, "output_scale", vec2(1, 1));';
  const outputPatched =
    '        // Fixed-size vectors deserialize through their backing arrays.\n' +
    '        object.tryGetRef(state, outputScale.data, "output_scale");';
  const enumOriginal =
    '        object.tryGetRef(state, modelType_, "model_type", PhysicsModel.Pendulum);\n' +
    '        object.tryGetRef(state, mapMode, "map_mode", ParamMapMode.AngleLength);';
  const enumPatched =
    '        // Inochi2D 0.8 serialized enum member names, while 0.9 uses the\n' +
    '        // lower-case string values declared by the enums.\n' +
    '        string legacyModelType;\n' +
    '        object.tryGetRef(state, legacyModelType, "model_type");\n' +
    '        switch (legacyModelType) {\n' +
    '        case "Pendulum":\n' +
    '            modelType_ = PhysicsModel.Pendulum;\n' +
    '            break;\n' +
    '        case "SpringPendulum":\n' +
    '            modelType_ = PhysicsModel.SpringPendulum;\n' +
    '            break;\n' +
    '        default:\n' +
    '            object.tryGetRef(state, modelType_, "model_type", PhysicsModel.Pendulum);\n' +
    '            break;\n' +
    '        }\n' +
    '        string legacyMapMode;\n' +
    '        object.tryGetRef(state, legacyMapMode, "map_mode");\n' +
    '        switch (legacyMapMode) {\n' +
    '        case "AngleLength":\n' +
    '            mapMode = ParamMapMode.AngleLength;\n' +
    '            break;\n' +
    '        case "XY":\n' +
    '            mapMode = ParamMapMode.XY;\n' +
    '            break;\n' +
    '        case "LengthAngle":\n' +
    '            mapMode = ParamMapMode.LengthAngle;\n' +
    '            break;\n' +
    '        case "YX":\n' +
    '            mapMode = ParamMapMode.YX;\n' +
    '            break;\n' +
    '        default:\n' +
    '            object.tryGetRef(state, mapMode, "map_mode", ParamMapMode.AngleLength);\n' +
    '            break;\n' +
    '        }';
  const enumAmbiguous = enumPatched
    .replace(
      '        string legacyModelType;\n        object.tryGetRef(state, legacyModelType, "model_type");',
      '        const legacyModelType = object.tryGet!string(state, "model_type");',
    )
    .replace(
      '        string legacyMapMode;\n        object.tryGetRef(state, legacyMapMode, "map_mode");',
      '        const legacyMapMode = object.tryGet!string(state, "map_mode");',
    );
  let source = await readFile(physicsPath, "utf8");
  if (!source.includes(outputPatched)) {
    if (!source.includes(outputOriginal)) {
      throw new Error(
        "official SDK simple-physics output scale decoder changed; compatibility patch was not applied",
      );
    }
    source = source.replace(outputOriginal, outputPatched);
  }
  if (!source.includes(enumPatched)) {
    if (source.includes(enumAmbiguous)) {
      source = source.replace(enumAmbiguous, enumPatched);
    } else if (source.includes(enumOriginal)) {
      source = source.replace(enumOriginal, enumPatched);
    } else {
      throw new Error(
        "official SDK simple-physics enum decoder changed; compatibility patch was not applied",
      );
    }
  }
  await writeFile(physicsPath, source);
}

async function restoreLegacyPropertyLifecycle(nodePath, puppetPath) {
  const nodeOriginal =
    "    final void preUpdate(DrawList drawList) @nogc {\n" +
    "        if (!enabled)\n" +
    "            return;\n\n" +
    "        this.onPreUpdate(drawList);";
  const nodePatched =
    "    final void preUpdate(DrawList drawList) @nogc {\n" +
    "        // Creator 0.8 cleared every accumulated parameter offset before\n" +
    "        // applying the next frame. Without this, additive compatibility\n" +
    "        // bindings retain stale values and drift on every update.\n" +
    "        this.resetProperties();\n" +
    "        if (!enabled)\n" +
    "            return;\n\n" +
    "        this.onPreUpdate(drawList);";
  const nodeSource = await readFile(nodePath, "utf8");
  if (!nodeSource.includes(nodePatched)) {
    if (!nodeSource.includes(nodeOriginal)) {
      throw new Error(
        "official SDK node update lifecycle changed; property-reset patch was not applied",
      );
    }
    await writeFile(nodePath, nodeSource.replace(nodeOriginal, nodePatched));
  }

  const puppetOriginal =
    "        if (renderParameters) {\n" +
    "            foreach (parameter; parameters_) {\n" +
    "                parameter.update();\n" +
    "            }\n" +
    "        }";
  const puppetPatched =
    "        if (renderParameters) {\n" +
    "            foreach (parameter; parameters_) {\n" +
    "                // A legacy physics driver applies its output parameter\n" +
    "                // later in this frame. Applying it here as well would\n" +
    "                // compose the previous and current physics states twice.\n" +
    "                version (IN_LEGACY) {\n" +
    "                    if (!enableDrivers || parameter !in driven_)\n" +
    "                        parameter.update();\n" +
    "                } else {\n" +
    "                    parameter.update();\n" +
    "                }\n" +
    "            }\n" +
    "        }";
  const puppetSource = await readFile(puppetPath, "utf8");
  if (!puppetSource.includes(puppetPatched)) {
    if (!puppetSource.includes(puppetOriginal)) {
      throw new Error(
        "official SDK parameter update lifecycle changed; legacy-driver patch was not applied",
      );
    }
    await writeFile(
      puppetPath,
      puppetSource.replace(puppetOriginal, puppetPatched),
    );
  }
}

async function fixSimplePhysicsLocalCoordinates(physicsPath) {
  const original =
    "        auto localPos4 = localOnly ?\n" +
    "            vec4(output.x, output.y, 0, 1) : (this.matrix.inverse * vec4(output.x, output.y, 0, 1));\n" +
    "        vec2 localAngle = vec2(localPos4.x, localPos4.y).normalized;";
  const patched =
    "        vec2 localAngle;\n" +
    "        if (localOnly) {\n" +
    "            localAngle = vec2(output.x, output.y).normalized;\n" +
    "        } else {\n" +
    "            // numath 0.5.0 implements matrix.inverse as multiplication by\n" +
    "            // -1, so invert the affine XY basis explicitly. Physics only\n" +
    "            // needs the direction from the transformed anchor to the bob.\n" +
    "            const basis = this.matrix.matrix;\n" +
    "            const determinant =\n" +
    "                basis.matrix[0][0] * basis.matrix[1][1] -\n" +
    "                basis.matrix[0][1] * basis.matrix[1][0];\n" +
    "            if (abs(determinant) < 0.000001f)\n" +
    "                return;\n" +
    "            const worldOffset = output - anchor;\n" +
    "            localAngle = vec2(\n" +
    "                (\n" +
    "                    basis.matrix[1][1] * worldOffset.x -\n" +
    "                    basis.matrix[0][1] * worldOffset.y\n" +
    "                ) / determinant,\n" +
    "                (\n" +
    "                    -basis.matrix[1][0] * worldOffset.x +\n" +
    "                    basis.matrix[0][0] * worldOffset.y\n" +
    "                ) / determinant,\n" +
    "            ).normalized;\n" +
    "        }";
  const source = await readFile(physicsPath, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK simple-physics coordinate conversion changed; affine-inverse patch was not applied",
    );
  }
  await writeFile(physicsPath, source.replace(original, patched));
}

async function enableRuntimeBindings(sdkRoot) {
  const patchRoot = resolve(workspaceRoot, "tools/official-sdk/patches");
  const bindingsRoot = resolve(sdkRoot, "source/inochi2d/param/bindings");
  await Promise.all([
    copyFile(resolve(patchRoot, "bindings/node.d"), resolve(bindingsRoot, "node.d")),
    copyFile(resolve(patchRoot, "bindings/property.d"), resolve(bindingsRoot, "property.d")),
    copyFile(resolve(patchRoot, "bindings/deform.d"), resolve(bindingsRoot, "deform.d")),
    copyFile(resolve(patchRoot, "utils.d"), resolve(sdkRoot, "source/inochi2d/param/utils.d")),
  ]);

  const bindingPackagePath = resolve(bindingsRoot, "package.d");
  const bindingPackage = await readFile(bindingPackagePath, "utf8");
  const disabledDeserializer = `ParameterBinding tryDeserializeBinding(ref DataNode object, ref ModelState state, Parameter param) @nogc {
    //if (state.doUpgrade08) {
    //    if (auto prop = object.tryGet!string(state, "param_name", null)) {
    //        state.info(nstring("0.8->0.9: upgrading binding ", prop, "..."));
    //        auto binding = prop == "deform" ?
    //            nogc_new!ParameterDeformBinding(param) :
    //            nogc_new!ParameterPropertyBinding(param);

    //        binding.deserialize(object, state);
    //        return cast(ParameterBinding)binding;
    //    }

    //    state.warning(nstring("0.8->0.9: Encountered a unnamed binding, ignoring..."));
    //    return null;
    //}

    //if (auto binding = in_binding_registry.tryCreateFrom(object, param)) {
    //    binding.deserialize(object, state);
    //    return binding;
    //}

    state.warning(nstring("Encountered untyped binding, ignoring..."));
    return null;
}`;
  const enabledDeserializer = `ParameterBinding tryDeserializeBinding(ref DataNode object, ref ModelState state, Parameter param) @nogc {
    if (auto prop = object.tryGet!string(state, "param_name", null)) {
        auto binding = prop == "deform" ?
            cast(ParameterBinding)nogc_new!ParameterDeformBinding(param) :
            cast(ParameterBinding)nogc_new!ParameterPropertyBinding(param);
        binding.deserialize(object, state);
        return binding;
    }

    if (auto binding = in_binding_registry.tryCreateFrom(object, param)) {
        binding.deserialize(object, state);
        return binding;
    }

    state.error(nstring("Encountered an unsupported parameter binding."));
    return null;
}`;
  if (!bindingPackage.includes(enabledDeserializer)) {
    if (!bindingPackage.includes(disabledDeserializer)) {
      throw new Error(
        "official SDK binding deserializer changed; runtime-binding patch was not applied",
      );
    }
    await writeFile(
      bindingPackagePath,
      bindingPackage.replace(disabledDeserializer, enabledDeserializer),
    );
  }

  const deformationPath = resolve(sdkRoot, "source/inochi2d/core/math/deform.d");
  const deformationSource = await readFile(deformationPath, "utf8");
  const brokenIndex = "this.vertexOffsets[i / 2] = element.deserialize!vec2(state);";
  const indexedButUndecoded =
    "this.vertexOffsets[i] = element.deserialize!vec2(state);";
  const fixedIndex = `if (!element.isArray || element.length != 2) {
                    state.error("deformation offset must contain exactly two numbers");
                    continue;
                }
                vec2 decoded;
                element.tryGetRef(state, decoded.x, 0);
                element.tryGetRef(state, decoded.y, 1);
                if (!decoded.isFinite) {
                    state.error("deformation offset must contain finite numbers");
                    continue;
                }
                this.vertexOffsets[i] = decoded;`;
  let patchedDeformationSource = deformationSource;
  if (!patchedDeformationSource.includes(fixedIndex)) {
    if (patchedDeformationSource.includes(indexedButUndecoded)) {
      patchedDeformationSource = patchedDeformationSource.replace(
        indexedButUndecoded,
        fixedIndex,
      );
    } else if (patchedDeformationSource.includes(brokenIndex)) {
      patchedDeformationSource = patchedDeformationSource.replace(
        brokenIndex,
        fixedIndex,
      );
    } else {
      throw new Error(
        "official SDK deformation decoder changed; runtime-binding patch was not applied",
      );
    }
  }
  const brokenCopy = "this.vertexOffsets = vertexOffsets.nu_dup();";
  const fixedCopy = "this.vertexOffsets = other.vertexOffsets.nu_dup();";
  if (!patchedDeformationSource.includes(fixedCopy)) {
    if (!patchedDeformationSource.includes(brokenCopy)) {
      throw new Error(
        "official SDK deformation copy constructor changed; runtime-binding patch was not applied",
      );
    }
    patchedDeformationSource = patchedDeformationSource.replace(brokenCopy, fixedCopy);
  }
  if (patchedDeformationSource !== deformationSource) {
    await writeFile(deformationPath, patchedDeformationSource);
  }

  await initializePropertyValues(
    resolve(sdkRoot, "source/inochi2d/core/property.d"),
  );

  await orderParameterAxesBeforeBindings(
    resolve(sdkRoot, "source/inochi2d/param/parameters/param1d.d"),
    `        super.onDeserialize(object, state);
        object.tryGetRef(state, min, "min");
        object.tryGetRef(state, max, "max");
        object.tryGetRef(state, defaults, "defaults");

        // 0.8->0.9 upgrades
        if (state.doUpgrade08) {
            state.info("0.8->0.9: Upgrading 1D axis mapping...");
            object.tryGetRef(state, points, "axis_points");
            return;
        }

        object.tryGetRef(state, points, "points");`,
    `        object.tryGetRef(state, min, "min");
        object.tryGetRef(state, max, "max");
        object.tryGetRef(state, defaults, "defaults");

        // Bindings allocate their keypoint grids in the base deserializer, so
        // the axis layout must be available first.
        if (state.doUpgrade08) {
            state.info("0.8->0.9: Upgrading 1D axis mapping...");
            object.tryGetRef(state, points, "axis_points");
        } else {
            object.tryGetRef(state, points, "points");
        }
        super.onDeserialize(object, state);`,
  );
  await upgradeLegacy1dAxisLayout(
    resolve(sdkRoot, "source/inochi2d/param/parameters/param1d.d"),
  );
  await normalizeLegacyParameterInput(
    resolve(sdkRoot, "source/inochi2d/param/parameters/param1d.d"),
    "ptrdiff_t index = findKeypointAndNormal(value, norm);",
    "ptrdiff_t index = findKeypointAndNormal(normalize(value), norm);",
  );
  await normalizeLegacyParameterInput(
    resolve(sdkRoot, "source/inochi2d/param/parameters/param2d.d"),
    "vec2u index = findKeypointAndNormal(value, norm);",
    "vec2u index = findKeypointAndNormal(normalize(value), norm);",
  );
  await orderParameterAxesBeforeBindings(
    resolve(sdkRoot, "source/inochi2d/param/parameters/param2d.d"),
    `        super.onDeserialize(object, state);
        object.tryGetRef(state, min, "min");
        object.tryGetRef(state, max, "max");
        object.tryGetRef(state, defaults, "defaults");

        // 0.8->0.9 upgrades
        if (state.doUpgrade08) {
            state.info("0.8->0.9: Upgrading 2D axis mapping...");

            auto axes = "axis_points" in object;
            if (axes && (*axes).isArray) {
                (*axes).tryGetRef(state, hpoints, 0);
                (*axes).tryGetRef(state, vpoints, 1);
            }
            return;
        }

        object.tryGetRef(state, hpoints, "hpoints");
        object.tryGetRef(state, vpoints, "vpoints");`,
    `        object.tryGetRef(state, min, "min");
        object.tryGetRef(state, max, "max");
        object.tryGetRef(state, defaults, "defaults");

        // Bindings allocate their keypoint grids in the base deserializer, so
        // the axis layout must be available first.
        if (state.doUpgrade08) {
            state.info("0.8->0.9: Upgrading 2D axis mapping...");
            auto axes = "axis_points" in object;
            if (axes && (*axes).isArray) {
                (*axes).tryGetRef(state, hpoints, 0);
                (*axes).tryGetRef(state, vpoints, 1);
            }
        } else {
            object.tryGetRef(state, hpoints, "hpoints");
            object.tryGetRef(state, vpoints, "vpoints");
        }
        super.onDeserialize(object, state);`,
  );

  const cffiPath = resolve(sdkRoot, "source/inochi2d/cffi.d");
  const cffiSource = await readFile(cffiPath, "utf8");
  const parameterSetter = `void in_parameter_set_value(in_parameter_t* obj, float* values) {
    size_t dims = (cast(Parameter)obj).dimensions;
    (cast(Parameter)obj).currentValue[0 .. dims] = values[0 .. dims];
}`;
  const parameterSetterWithBasicCount = `${parameterSetter}

/**
    Gets the number of runtime bindings owned by a parameter.
*/
uint in_parameter_get_binding_count(in_parameter_t* obj) {
    return cast(uint)(cast(Parameter)obj).bindings.length;
}`;
  const parameterSetterWithCount = `${parameterSetterWithBasicCount}

/**
    Gets the number of parameter bindings with a resolved node target.
*/
uint in_parameter_get_bound_binding_count(in_parameter_t* obj) {
    uint count;
    foreach (binding; (cast(Parameter)obj).bindings) {
        if (auto nodeBinding = cast(ParameterNodeBinding)binding) {
            if (nodeBinding.target)
                count++;
        }
    }
    return count;
}

/**
    Gets how many binding applications produced invalid runtime values.
*/
uint in_parameter_get_invalid_binding_application_count(in_parameter_t* obj) {
    uint count;
    foreach (binding; (cast(Parameter)obj).bindings) {
        if (auto propertyBinding = cast(ParameterPropertyBinding)binding) {
            count += propertyBinding.invalidApplications;
        }
        if (auto deformBinding = cast(ParameterDeformBinding)binding) {
            count += deformBinding.invalidApplications;
        }
    }
    return count;
}`;
  const cffiBlockStart = cffiSource.indexOf(parameterSetter);
  const cffiBlockEnd = cffiSource.indexOf(
    "\n//\n//              TEXTURE CACHE",
    cffiBlockStart,
  );
  if (cffiBlockStart < 0 || cffiBlockEnd < 0) {
    throw new Error(
      "official SDK parameter C API changed; binding diagnostics patch was not applied",
    );
  }
  if (cffiSource.slice(cffiBlockStart, cffiBlockEnd).trimEnd() !== parameterSetterWithCount) {
    await writeFile(
      cffiPath,
      `${cffiSource.slice(0, cffiBlockStart)}${parameterSetterWithCount}\n\n\n\n` +
        cffiSource.slice(cffiBlockEnd + 1),
    );
  }
}

async function restrictBrowserExports(cffiPath, recipePath) {
  const allocatorExports = ["nu_malloc", "nu_realloc", "nu_free"];
  const removedExports = [
    "in_texture_flip_vertically",
    "in_puppet_get_driver_anchor_x",
    "in_puppet_get_driver_anchor_y",
  ];
  const cffiExports = [
    "in_puppet_load_from_memory",
    "in_puppet_free",
    "in_puppet_update",
    "in_puppet_draw",
    "in_puppet_get_parameters",
    "in_puppet_get_drawlist",
    "in_puppet_get_texture_cache",
    "in_puppet_get_physics_enabled",
    "in_puppet_set_physics_enabled",
    "in_puppet_get_driver_count",
    "in_puppet_get_resolved_driver_count",
    "in_puppet_get_spring_driver_count",
    "in_puppet_get_xy_driver_count",
    "in_puppet_get_nonzero_physics_scale_count",
    "in_parameter_get_name",
    "in_parameter_get_dimensions",
    "in_parameter_get_lower_bounds",
    "in_parameter_get_upper_bounds",
    "in_parameter_get_binding_count",
    "in_parameter_get_bound_binding_count",
    "in_parameter_get_invalid_binding_application_count",
    "in_parameter_get_value",
    "in_parameter_set_value",
    "in_texture_cache_get_size",
    "in_texture_cache_get_texture",
    "in_texture_get_width",
    "in_texture_get_height",
    "in_texture_get_channels",
    "in_texture_get_pixels",
    "in_texture_premultiply",
    "in_drawlist_get_commands",
    "in_drawlist_get_vertex_data",
    "in_drawlist_get_index_data",
  ];
  const browserExports = [...allocatorExports, ...cffiExports];
  let cffiSource = await readFile(cffiPath, "utf8");
  const exportedScope = "version (IN_DYNLIB):\nextern (C) export @nogc:";
  const internalScope = "version (IN_DYNLIB):\nextern (C) @nogc:";
  if (!cffiSource.includes(internalScope)) {
    if (!cffiSource.includes(exportedScope)) {
      throw new Error(
        "official SDK C API export scope changed; browser export patch was not applied",
      );
    }
    cffiSource = cffiSource.replace(exportedScope, internalScope);
  }
  for (const symbol of cffiExports) {
    const exportedDefinition = new RegExp(
      `^export [^\\n]*\\b${symbol}\\s*\\(`,
      "mu",
    );
    if (exportedDefinition.test(cffiSource)) {
      continue;
    }
    const definition = new RegExp(`^([^\\n]*\\b${symbol}\\s*\\()`, "mu");
    if (!definition.test(cffiSource)) {
      throw new Error(
        `official SDK C API no longer defines ${symbol}; browser export patch was not applied`,
      );
    }
    cffiSource = cffiSource.replace(definition, "export $1");
  }
  for (const symbol of removedExports) {
    const exportedDefinition = new RegExp(
      `^export ([^\\n]*\\b${symbol}\\s*\\()`,
      "mu",
    );
    cffiSource = cffiSource.replace(exportedDefinition, "$1");
  }
  await writeFile(cffiPath, cffiSource);

  const originalFlags = '    lflags "--entry=in_init" "--allow-undefined"';
  const patchedFlags =
    '    dflags "-fvisibility=hidden"\n' +
    `${originalFlags}\n` +
    '    lflags "--no-export-dynamic" "--gc-sections"\n' +
    browserExports
      .map((symbol) => `    lflags "--export=${symbol}"`)
      .join("\n");
  const recipe = await readFile(recipePath, "utf8");
  let normalizedRecipe = recipe.replace(
    '    dflags "-fvisibility=hidden"\n',
    "",
  );
  normalizedRecipe = normalizedRecipe.replace(
    '    lflags "--no-export-dynamic" "--gc-sections"\n',
    "",
  );
  for (const symbol of browserExports) {
    normalizedRecipe = normalizedRecipe.replaceAll(
      `\n    lflags "--export=${symbol}"`,
      "",
    );
  }
  for (const symbol of removedExports) {
    normalizedRecipe = normalizedRecipe.replaceAll(
      `\n    lflags "--export=${symbol}"`,
      "",
    );
  }
  if (!normalizedRecipe.includes(originalFlags)) {
    throw new Error(
      "official SDK wasm linker flags changed; browser export patch was not applied",
    );
  }
  const patchedRecipe = normalizedRecipe.replace(
    originalFlags,
    patchedFlags,
  );
  if (patchedRecipe !== recipe) {
    await writeFile(recipePath, patchedRecipe);
  }
}

async function enablePhysicsDiagnostics(path) {
  const original = `void in_puppet_reset_drivers(in_puppet_t* obj) {
    assumeNoThrowNoGC(&(cast(Puppet)obj).resetDrivers);
}`;
  const patched = `${original}

/**
    Gets the number of model-authored legacy physics drivers.
*/
uint in_puppet_get_driver_count(in_puppet_t* obj) {
    return cast(uint)(cast(Puppet)obj).drivers.length;
}

/**
    Gets the number of physics drivers whose output parameters resolved.
*/
uint in_puppet_get_resolved_driver_count(in_puppet_t* obj) {
    uint count;
    foreach (driver; (cast(Puppet)obj).drivers) {
        if (driver.param !is null)
            count++;
    }
    return count;
}

uint in_puppet_get_spring_driver_count(in_puppet_t* obj) {
    uint count;
    foreach (driver; (cast(Puppet)obj).drivers) {
        if (driver.modelType == PhysicsModel.SpringPendulum)
            count++;
    }
    return count;
}

uint in_puppet_get_xy_driver_count(in_puppet_t* obj) {
    uint count;
    foreach (driver; (cast(Puppet)obj).drivers) {
        if (driver.mapMode == ParamMapMode.XY)
            count++;
    }
    return count;
}

uint in_puppet_get_nonzero_physics_scale_count(in_puppet_t* obj) {
    uint count;
    foreach (driver; (cast(Puppet)obj).drivers) {
        auto scale = driver.finalOutputScale;
        if (scale.x != 0 || scale.y != 0)
            count++;
    }
    return count;
}`;
  const source = await readFile(path, "utf8");
  const exportedPatched = patched
    .replace(
      "\nuint in_puppet_get_driver_count",
      "\nexport uint in_puppet_get_driver_count",
    )
    .replace(
      "\nuint in_puppet_get_resolved_driver_count",
      "\nexport uint in_puppet_get_resolved_driver_count",
    )
    .replace(
      "\nuint in_puppet_get_spring_driver_count",
      "\nexport uint in_puppet_get_spring_driver_count",
    )
    .replace(
      "\nuint in_puppet_get_xy_driver_count",
      "\nexport uint in_puppet_get_xy_driver_count",
    )
    .replace(
      "\nuint in_puppet_get_nonzero_physics_scale_count",
      "\nexport uint in_puppet_get_nonzero_physics_scale_count",
    );
  if (source.includes(patched) || source.includes(exportedPatched)) {
    return;
  }
  const springStart = patched.indexOf(
    "\n\nuint in_puppet_get_spring_driver_count",
  );
  const basePatched = patched.slice(0, springStart);
  const exportedBasePatched = basePatched
    .replace(
      "\nuint in_puppet_get_driver_count",
      "\nexport uint in_puppet_get_driver_count",
    )
    .replace(
      "\nuint in_puppet_get_resolved_driver_count",
      "\nexport uint in_puppet_get_resolved_driver_count",
    );
  if (source.includes(exportedBasePatched)) {
    await writeFile(path, source.replace(exportedBasePatched, patched));
    return;
  }
  if (source.includes(basePatched)) {
    await writeFile(path, source.replace(basePatched, patched));
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK physics C API changed; diagnostics patch was not applied",
    );
  }
  await writeFile(path, source.replace(original, patched));
}

async function orderParameterAxesBeforeBindings(path, original, patched) {
  const source = await readFile(path, "utf8");
  if (
    source.includes(patched) ||
    source.includes(
      "// Bindings allocate their keypoint grids in the base deserializer",
    )
  ) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK parameter layout changed; binding-allocation patch was not applied",
    );
  }
  await writeFile(path, source.replace(original, patched));
}

async function normalizeLegacyParameterInput(path, original, patched) {
  const source = await readFile(path, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK parameter update changed; legacy-normalization patch was not applied",
    );
  }
  await writeFile(path, source.replace(original, patched));
}

async function upgradeLegacy1dAxisLayout(path) {
  const original =
    '        if (state.doUpgrade08) {\n' +
    '            state.info("0.8->0.9: Upgrading 1D axis mapping...");\n' +
    '            object.tryGetRef(state, points, "axis_points");\n' +
    "        } else {\n" +
    '            object.tryGetRef(state, points, "points");\n' +
    "        }\n" +
    "        super.onDeserialize(object, state);";
  const patched =
    '        if (state.doUpgrade08) {\n' +
    '            state.info("0.8->0.9: Upgrading 1D axis mapping...");\n' +
    '            auto axes = "axis_points" in object;\n' +
    "            if (axes && (*axes).isArray) {\n" +
    "                if ((*axes).length > 0 && (*axes)[0].isArray) {\n" +
    "                    (*axes).tryGetRef(state, points, 0);\n" +
    "                } else {\n" +
    '                    object.tryGetRef(state, points, "axis_points");\n' +
    "                }\n" +
    "            }\n" +
    "        } else {\n" +
    '            object.tryGetRef(state, points, "points");\n' +
    "        }\n" +
    "        super.onDeserialize(object, state);";
  const source = await readFile(path, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK 1D axis layout changed; legacy-axis patch was not applied",
    );
  }
  await writeFile(path, source.replace(original, patched));
}

async function initializePropertyValues(path) {
  const original =
    "        // Set default value and copy it to the set value.\n" +
    "        nu_memcpy(&dbuffer_[offset], cast(void*)&default_, T.sizeof);\n" +
    "        return offset;";
  const patched =
    "        // Set both the default and live values. Leaving vbuffer_ uninitialized\n" +
    "        // poisons transforms as soon as a parameter changes one overlay.\n" +
    "        nu_memcpy(&dbuffer_[offset], cast(void*)&default_, T.sizeof);\n" +
    "        nu_memcpy(&vbuffer_[offset], cast(void*)&default_, T.sizeof);\n" +
    "        return offset;";
  const source = await readFile(path, "utf8");
  if (source.includes(patched)) {
    return;
  }
  if (!source.includes(original)) {
    throw new Error(
      "official SDK property initialization changed; live-value patch was not applied",
    );
  }
  await writeFile(path, source.replace(original, patched));
}

async function requireHash(path, expected, label) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
  }
  const actual = digest.digest("hex");
  if (actual !== expected) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, got ${actual}`);
  }
}

async function ensureSymlink(target, destination) {
  try {
    const current = await readlink(destination);
    if (resolve(dirname(destination), current) === resolve(target)) {
      return;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "EINVAL") {
      throw error;
    }
  }

  // Replace stale cache shims atomically so the version-checked linker is the
  // linker that the D compiler actually resolves from PATH.
  const temporary = `${destination}.tmp-${process.pid}`;
  await unlink(temporary).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  try {
    await symlink(target, temporary);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

function run(command, args, cwd, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const outcome =
      result.status === null
        ? `was terminated by signal ${result.signal ?? "unknown"}`
        : `exited with status ${result.status}`;
    throw new Error(`${command} ${outcome}`);
  }
}

function requireToolVersion(command, args, expected, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw new Error(`${label} is required`, { cause: result.error });
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0 || !expected.test(output)) {
    throw new Error(`${label} is required; detected ${output || "no version output"}`);
  }
}
