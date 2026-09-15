import fs from "node:fs";
import path from "node:path";
import {inflateSync} from "node:zlib";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {checkSource,inspectPng} from "./source.mjs";
const root = fileURLToPath(new URL("../../",import.meta.url));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
export function decodeRgb(bytes) {
  const info = inspectPng(bytes);
  if (info.bitDepth !== 8 || info.colorType !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0
    || info.width < 1 || info.height < 1 || info.width*info.height > 4_000_000) throw new Error("Unsupported brand PNG");
  let offset=8; const chunks=[];
  while (offset+12 <= bytes.length) {
    const length=bytes.readUInt32BE(offset), type=bytes.toString("ascii",offset+4,offset+8);
    if (offset+12+length > bytes.length) throw new Error("Truncated PNG chunk");
    if (type === "IDAT") chunks.push(bytes.subarray(offset+8,offset+8+length));
    offset += 12+length;
    if (type === "IEND") break;
  }
  const stride=info.width*3, expected=(stride+1)*info.height;
  const raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});
  if (raw.length !== expected) throw new Error("PNG scanline length mismatch");
  const rgb=Buffer.alloc(stride*info.height);
  for (let row=0; row<info.height; row++) {
    const filter=raw[row*(stride+1)];
    if (filter > 4) throw new Error("Unsupported PNG filter");
    for (let column=0; column<stride; column++) {
      const index=row*stride+column;
      const a=column>=3?rgb[index-3]:0, b=row>0?rgb[index-stride]:0,
        c=row>0 && column>=3?rgb[index-stride-3]:0;
      let predictor=0;
      if (filter===1) predictor=a;
      if (filter===2) predictor=b;
      if (filter===3) predictor=Math.floor((a+b)/2);
      if (filter===4) {
        const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
        predictor=pa<=pb && pa<=pc?a:(pb<=pc?b:c);
      }
      rgb[index]=(raw[row*(stride+1)+1+column]+predictor)&255;
    }
  }
  return {...info,rgb};
}
export function createTexture(image, rect, canvas=512) {
  const [x,y,w,h]=rect;
  if (!rect.every(Number.isSafeInteger) || rect.length!==4 || x<0 || y<0 || w<1 || h<1
    || x+w>image.width || y+h>image.height || w>canvas || h>canvas
    || ![128,256,512,1024].includes(canvas)) throw new Error("Invalid brand texture viewport");
  const left=Math.floor((canvas-w)/2), top=Math.floor((canvas-h)/2);
  const tga=Buffer.alloc(18+canvas*canvas*4);
  tga[2]=2; tga.writeUInt16LE(canvas,12); tga.writeUInt16LE(canvas,14); tga[16]=32; tga[17]=40;
  for (let row=0; row<h; row++) for (let column=0; column<w; column++) {
    const source=((row+y)*image.width+column+x)*3, target=18+((row+top)*canvas+column+left)*4;
    tga[target]=image.rgb[source+2]; tga[target+1]=image.rgb[source+1]; tga[target+2]=image.rgb[source]; tga[target+3]=255;
  }
  return {tga,content:[left,top,w,h],uv:[left/canvas,(left+w)/canvas,top/canvas,(top+h)/canvas]};
}
export function createRuntime(repository=root) {
  const source=checkSource(repository);
  const recipe=JSON.parse(fs.readFileSync(path.join(repository,"assets/brand/variants.json"),"utf8"));
  const symbol=recipe.variants.find(value=>value.id==="symbol-color");
  if (recipe.sourceSha256!==source.sha256 || !symbol) throw new Error("Missing approved symbol viewport");
  const image=decodeRgb(fs.readFileSync(path.join(repository,"assets/brand/Spynon Logo.png")));
  const result=createTexture(image,symbol.rect);
  const manifest={schemaVersion:1,approval:"APPROVED_SOURCE_TECHNICAL_DERIVATIVE",retailPreview:"PENDING",
    sourceSha256:source.sha256,method:"UNSCALED_RGB_CROP_WITH_TRANSPARENT_CANVAS_PADDING",
    viewport:symbol.rect,canvas:[512,512],content:result.content,uv:result.uv,
    runtime:"UI/Media/Textures/Brand/spynon-symbol-v1.tga",bytes:result.tga.length,runtimeSha256:hash(result.tga)};
  return {tga:result.tga,manifest};
}
export function run(mode="check") {
  if (!["build","check"].includes(mode)) throw new Error("Use build or check");
  const {tga,manifest}=createRuntime();
  const outputs=[[path.join(root,"addon",manifest.runtime),tga],
    [path.join(root,"assets/brand/runtime.json"),Buffer.from(JSON.stringify(manifest,null,2)+"\n")]];
  for (const [file] of outputs) {
    if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error("Invalid runtime output path");
  }
  for (const [file,value] of outputs) {
    if (mode==="build") {fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,value);}
    else if (!fs.existsSync(file) || !fs.readFileSync(file).equals(value)) throw new Error(`Brand runtime drift: ${file}`);
  }
  console.log(`Brand runtime ${mode}: source pixels preserved; ${manifest.bytes} bytes; Retail preview pending.`);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) run(process.argv[2]);
