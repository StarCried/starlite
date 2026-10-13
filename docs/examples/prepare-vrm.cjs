// node prepare-vrm.cjs
// 路径相对当前工作目录；output 必须尚不存在。
// 仅复制模型与现成 VRMA，不导出 Blender 动作，也不压缩模型。
const { prepareModel } = require('@starcried/starlite-vrm/prepare');

prepareModel({
  model: './my-assets/avatar.vrm',
  animations: [
    { name: 'Idle', path: './my-assets/Idle.vrma' },
    { name: 'Wave', path: './my-assets/Wave.vrma' },
    { name: 'Nod', path: './my-assets/Nod.vrma' },
    { name: 'Stretch', path: './my-assets/Stretch.vrma' },
  ],
  // 标准 VRM 不需要 profile；微光等角色按资源包说明提供。
  // profile: './my-assets/profile.json',
  output: './starlite-bundle',
  // 默认保留 false。核实所有模型、贴图、动作许可后才改为 true。
  allowRedistribution: false,
}).then(manifest => {
  console.log('Source SHA-256:', manifest.model.sourceSha256);
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
