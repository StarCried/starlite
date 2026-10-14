// Artwork-free geometry and humanoid hierarchy, authored for this repository.
export function glb(json, binary=Buffer.alloc(0)) {
 const text=Buffer.from(JSON.stringify(json)), size=Math.ceil(text.length/4)*4, n=Math.ceil(binary.length/4)*4;
 const result=Buffer.alloc(20+size+(n?8+n:0));result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(size,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(32,20,20+size);text.copy(result,20);
 if(n){result.writeUInt32LE(n,20+size);result.writeUInt32LE(0x004e4942,24+size);binary.copy(result,28+size)} return result;
}
export function model(version="1") {
 const definitions=[
  ["hips",-1,[0,1,0]],["spine",0,[0,.2,0]],["head",1,[0,.5,0]],
  ["leftUpperLeg",0,[.12,-.05,0]],["leftLowerLeg",3,[0,-.4,0]],["leftFoot",4,[0,-.4,.1]],
  ["rightUpperLeg",0,[-.12,-.05,0]],["rightLowerLeg",6,[0,-.4,0]],["rightFoot",7,[0,-.4,.1]],
  ["leftUpperArm",1,[.2,.25,0]],["leftLowerArm",9,[.3,0,0]],["leftHand",10,[.2,0,0]],
  ["rightUpperArm",1,[-.2,.25,0]],["rightLowerArm",12,[-.3,0,0]],["rightHand",13,[-.2,0,0]]
 ];
 const nodes=definitions.map(([name,,translation])=>({name,translation,children:[]}));definitions.forEach(([,parent],i)=>{if(parent>=0)nodes[parent].children.push(i)});
 nodes[0].mesh=0;
 const positions=new Float32Array([-.25,0,0,.25,0,0,0,.65,0]);
 const binary=Buffer.concat([Buffer.from(positions.buffer),Buffer.alloc(positions.byteLength)]);
 const extension=version==="1" ? {VRMC_vrm:{specVersion:"1.0",meta:{name:"Synthetic triangle",authors:["StarCried test fixture"],licenseUrl:"https://vrm.dev/licenses/1.0/",otherLicenseUrl:"https://opensource.org/license/bsd-2-clause",allowRedistribution:true,modification:"allowModificationRedistribution"},humanoid:{humanBones:Object.fromEntries(definitions.map(([name],node)=>[name,{node}]))}}} : {VRM:{specVersion:"0.0",meta:{title:"Synthetic triangle",author:"StarCried test fixture",version:"1",licenseName:"Other"},humanoid:{humanBones:definitions.map(([bone],node)=>({bone,node,useDefaultValues:true}))}}};
 if(version==="1")extension.VRMC_vrm.expressions={preset:{blink:{morphTargetBinds:[{node:0,index:0,weight:1}]}}};
 else extension.VRM.blendShapeMaster={blendShapeGroups:[{name:"Blink",presetName:"blink",binds:[{mesh:0,index:0,weight:100}]}]};
 return glb({asset:{version:"2.0"},extensionsUsed:Object.keys(extension),extensions:extension,scene:0,scenes:[{nodes:[0]}],nodes,buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:positions.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[-.25,0,0],max:[.25,.65,0]},{bufferView:1,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[0,0,0]}],meshes:[{weights:[0],primitives:[{attributes:{POSITION:0},targets:[{POSITION:1}],material:0}]}],materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.3,.7,.9,1],metallicFactor:0}}]},binary);
}
export function motion() {
 const values=new Float32Array([0,.5,1,0,0,0,1,0,0,.15,Math.sqrt(1-.15**2),0,0,0,1]);
 return glb({asset:{version:"2.0"},extensionsUsed:["VRMC_vrm_animation"],extensions:{VRMC_vrm_animation:{specVersion:"1.0",humanoid:{humanBones:{hips:{node:0},head:{node:1}}}}},scene:0,scenes:[{nodes:[0]}],nodes:[{name:"hips",translation:[0,1,0],children:[1]},{name:"head",translation:[0,.7,0]}],buffers:[{byteLength:values.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:12},{buffer:0,byteOffset:12,byteLength:48}],accessors:[{bufferView:0,componentType:5126,type:"SCALAR",count:3,min:[0],max:[1]},{bufferView:1,componentType:5126,type:"VEC4",count:3}],animations:[{samplers:[{input:0,output:1,interpolation:"LINEAR"}],channels:[{sampler:0,target:{node:1,path:"rotation"}}]}]},Buffer.from(values.buffer));
}
