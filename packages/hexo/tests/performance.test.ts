import {expect,it} from "vitest";
import {readEnabledConfig} from "../src/config";
import type {HexoLike} from "../src/types";

for (const backend of ["inochi2d", "vrm"] as const) {
  it(`${backend} forwards the opt-in performance display without enabling it by default`, () => {
    const hexo = {config:{starlite:{enable:true,backend,model:`/avatar.${backend === "vrm" ? "vrm" : "inp"}`,fallback:"/avatar.png",interactions:{click:false}}}} as HexoLike;
    expect(readEnabledConfig(hexo)?.widget.performance).toBeUndefined();
    hexo.config.starlite!.performance = {show:true};
    expect(readEnabledConfig(hexo)?.widget.performance).toEqual({show:true});
    hexo.config.starlite!.performance = {show:false};
    expect(readEnabledConfig(hexo)?.widget.performance).toEqual({show:false});
  });
}
