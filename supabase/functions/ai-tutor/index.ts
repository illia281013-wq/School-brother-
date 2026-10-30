import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const subjects = ["english","algebra","geometry","ukrainian","physics","chemistry"];
const modes = ["detailed","simple","short","teach"];
const reply = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async (req: Request) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if (req.method!=="POST") return reply({error:"Method not allowed"},405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return reply({error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), key=Deno.env.get("OPENAI_API_KEY");
  if (!url||!anon||!key) return reply({error:"Server secrets are not configured"},503);
  const sb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError||!user) return reply({error:"Invalid session"},401);
  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
  const subject=String(body.subject||""), grade=Number(body.grade), mode=String(body.mode||"detailed"), task=String(body.task||"").trim();
  const image=typeof body.imageDataUrl==="string"?body.imageDataUrl:null;
  if(!subjects.includes(subject)||!Number.isInteger(grade)||grade<5||grade>11||!modes.includes(mode)) return reply({error:"Invalid subject, grade or mode"},400);
  if(task.length>8000||(!task&&!image)) return reply({error:"Task is empty or too long"},400);
  if(image&&(!/^data:image\/(png|jpeg|webp);base64,/.test(image)||image.length>7000000)) return reply({error:"Image must be PNG/JPG/WEBP up to 5 MB"},400);
  const names:Record<string,string>={english:"английский язык",algebra:"алгебра",geometry:"геометрия",ukrainian:"украинский язык",physics:"физика",chemistry:"химия"};
  const modeText:Record<string,string>={detailed:"подробно, объясняя каждый шаг",simple:"простыми словами",short:"кратко, но с обоснованием",teach:"как урок с нуля"};
  const system="Ты опытный школьный преподаватель по предмету "+names[subject]+" для "+grade+" класса. Режим: "+modeText[mode]+". Отвечай на русском, если ученик не попросил другой язык. Не выдумывай источники и условия. Если фото нечёткое или условие неполное — скажи об этом. Математика и физика: формулы, подстановка, единицы. Геометрия: теорема и доказательство. Языки: правило, разбор, исправление. Химия: индексы и баланс. Верни только JSON: {task:string,given:string[],required:string,theory:string[],steps:[{title:string,explanation:string,formula:string}],verification:string,answer:string,relatedTopics:string[]}. Без HTML и Markdown.";
  const content:unknown[]=[{type:"text",text:task||"Распознай и реши задание с изображения."}];
  if(image) content.push({type:"image_url",image_url:{url:image,detail:"high"}});
  try{
    const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("OPENAI_MODEL")||"gpt-4.1-mini",temperature:0.2,response_format:{type:"json_object"},messages:[{role:"system",content:system},{role:"user",content}]})});
    if(!response.ok){console.error("AI provider status",response.status);return reply({error:"AI provider request failed"},502);}
    const result=await response.json(), text=result.choices?.[0]?.message?.content;
    if(!text)return reply({error:"Empty AI response"},502);
    try{return reply({solution:JSON.parse(text)});}catch{return reply({error:"AI response format is invalid"},502);}
  }catch(error){console.error(error);return reply({error:"Unexpected server error"},500);}
});