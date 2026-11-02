import { expect, it } from "vitest";
import { validateEnvironmentLighting } from "../src/environment-lighting.js";
it.each([{color:"#aBc123"}, {color:"#000000",strength:0}, {color:"#ffffff",strength:1}])("accepts bounded explicit RGB %j", value => expect(()=>validateEnvironmentLighting(value)).not.toThrow());
it.each([null, false, [], {}, {color:"red"}, {color:"#fff"}, {color:"#ffffff00"}, {color:"#ffffff",strength:NaN}, {color:"#ffffff",strength:-.1}, {color:"#ffffff",strength:1.1}, {color:"#ffffff",darkColor:"#000000"}])("rejects invalid lighting %j", value => expect(()=>validateEnvironmentLighting(value)).toThrow("environmentLighting"));
