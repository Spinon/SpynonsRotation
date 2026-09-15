import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {deflateSync,crc32} from "node:zlib";
import {decodeRgb,createTexture,createRuntime} from "../../tools/brand/runtime.mjs";
function png(filter, scanline) {
  function chunk(name,data) {
    const result=Buffer.alloc(data.length+12); result.writeUInt32BE(data.length);
    result.write(name,4); data.copy(result,8); result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);
    return result;
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(1,4); header[8]=8; header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),
    chunk("IDAT",deflateSync(Buffer.from([filter,...scanline]))),chunk("IEND",Buffer.alloc(0))]);
}
test("RGB PNG decoder handles all five filter types without changing channel bytes", () => {
  const expected=Buffer.from([10,20,30,40,50,60]);
  const encoded=[[10,20,30,40,50,60],[10,20,30,30,30,30],[10,20,30,40,50,60],
    [10,20,30,35,40,45],[10,20,30,30,30,30]];
  for (let filter=0;filter<5;filter++) assert.deepEqual(decodeRgb(png(filter,encoded[filter])).rgb,expected);
  assert.throws(()=>decodeRgb(png(5,encoded[0])),/filter/u);
});
test("TGA uses top-left BGRA, opaque source pixels and transparent padding only", () => {
  const image={width:2,height:1,rgb:Buffer.from([10,20,30,40,50,60])};
  const {tga,content}=createTexture(image,[0,0,2,1],128);
  assert.equal(tga[2],2); assert.equal(tga[16],32); assert.equal(tga[17],40);
  const offset=18+(content[1]*128+content[0])*4;
  assert.deepEqual(tga.subarray(offset,offset+8),Buffer.from([30,20,10,255,60,50,40,255]));
  assert.equal(tga[21],0); assert.equal(tga.length,18+128*128*4);
});
test("runtime symbol reproduces exactly and every source pixel is preserved", () => {
  const {tga,manifest}=createRuntime(), image=decodeRgb(fs.readFileSync("assets/brand/Spynon Logo.png"));
  assert.deepEqual(fs.readFileSync(`addon/${manifest.runtime}`),tga);
  const [x,y,w,h]=manifest.viewport, [left,top]=manifest.content;
  for (let row=0;row<h;row++) for (let column=0;column<w;column++) {
    const source=((y+row)*image.width+x+column)*3, target=18+((top+row)*512+left+column)*4;
    assert.equal(tga[target],image.rgb[source+2]); assert.equal(tga[target+1],image.rgb[source+1]);
    assert.equal(tga[target+2],image.rgb[source]); assert.equal(tga[target+3],255);
  }
  assert.equal(manifest.retailPreview,"PENDING"); assert.deepEqual(createRuntime().tga,tga);
});
test("unsupported source format and out of bounds texture requests fail closed", () => {
  const input=png(0,[10,20,30,40,50,60]); input[25]=6;
  assert.throws(()=>decodeRgb(input),/Unsupported/u);
  const image={width:2,height:1,rgb:Buffer.alloc(6)};
  for (const rect of [[0,0,3,1],[-1,0,1,1],[0,0,1.5,1],[0,0,0,1]]) {
    assert.throws(()=>createTexture(image,rect),/viewport/u);
  }
});
