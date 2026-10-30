import { useCallback, useEffect, useMemo, useState } from "react";
import { aiFunctionName, isSupabaseConfigured, supabase } from "./lib/supabase.js";

const SUBJECTS = [
  { id:"english", icon:"🇬🇧", name:"Английский язык", description:"Грамматика, времена, перевод" },
  { id:"algebra", icon:"∑", name:"Алгебра", description:"Уравнения, функции, вычисления" },
  { id:"geometry", icon:"△", name:"Геометрия", description:"Теоремы, доказательства, чертежи" },
  { id:"ukrainian", icon:"А", name:"Украинский язык", description:"Орфография, морфология, синтаксис" },
  { id:"physics", icon:"⚛", name:"Физика", description:"Законы, величины, формулы" },
  { id:"chemistry", icon:"🧪", name:"Химия", description:"Элементы, реакции, расчёты" },
];
const NAV = [
  ["dashboard","⌂","Главная"],["solver","✧","AI-решатель"],["knowledge","▤","База знаний"],
  ["formulas","∑","Формулы"],["practice","◎","Тренажёр"],["progress","↗","Прогресс"],
  ["history","◷","История"],["profile","◉","Профиль"],
];
const GRADES = [5,6,7,8,9,10,11];
const MODES = [
  ["detailed","Подробно"],["simple","Простыми словами"],["short","Кратко"],["teach","Обучение с нуля"],
];

function Select({ value, onChange, children, ...props }) {
  return <select className="field" value={value} onChange={e=>onChange(e.target.value)} {...props}>{children}</select>;
}
function GradeSelect({ value, onChange }) {
  return <Select value={value} onChange={onChange}>{GRADES.map(g=><option key={g} value={g}>{g} класс</option>)}</Select>;
}
function SubjectSelect({ value, onChange }) {
  return <Select value={value} onChange={onChange}>{SUBJECTS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select>;
}
function Panel({ title, description, children }) {
  return <div className="panel"><h3>{title}</h3>{description&&<p className="desc">{description}</p>}{children}</div>;
}
function SolutionView({ solution }) {
  if (!solution) return null;
  return <div className="result">
    <h4>Условие</h4><p>{solution.task}</p>
    {!!solution.given?.length&&<><h4>Дано</h4><ul>{solution.given.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
    {solution.required&&<><h4>Найти / выполнить</h4><p>{solution.required}</p></>}
    {!!solution.theory?.length&&<><h4>Правило или теория</h4><ul>{solution.theory.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
    {!!solution.steps?.length&&<><h4>Пошаговое решение</h4><ol>{solution.steps.map((s,i)=><li key={i}><b>{s.title}</b><br/>{s.explanation}{s.formula&&<><br/><code>{s.formula}</code></>}</li>)}</ol></>}
    {solution.verification&&<><h4>Проверка</h4><p>{solution.verification}</p></>}
    <div className="answer"><b>Итоговый ответ</b><p>{solution.answer}</p></div>
  </div>;
}
function Dashboard({ onChoose, onQuickSolve, taskCount, configured }) {
  const [subject,setSubject]=useState("english");
  const [grade,setGrade]=useState(String(initialGrade||7));
  const [task,setTask]=useState("");
  return <section className="view active">
    <div className="hero"><div className="eyebrow">AI SCHOOL ASSISTANT</div><h2>Понимай предмет. Решай увереннее.</h2>
      <p>Отправляй школьное задание текстом или фотографией и получай подробное объяснение каждого шага.</p>
      <div className="tags"><span className="tag">6 предметов</span><span className="tag">5–11 классы</span><span className="tag">Пошаговые объяснения</span></div>
    </div>
    <div className="heading"><h2>Выбери предмет</h2><p>У каждого предмета — собственная логика объяснений</p></div>
    <div className="subjects">{SUBJECTS.map(s=><button className="subject" key={s.id} onClick={()=>onChoose(s.id)}><span style={{fontSize:22}}>{s.icon}</span><b>{s.name}</b><small>{s.description}</small></button>)}</div>
    <div className="grid">
      <Panel title="Быстрое решение" description="Введи задание и выбери предмет.">
        <div className="controls"><SubjectSelect value={subject} onChange={setSubject}/><GradeSelect value={grade} onChange={setGrade}/></div>
        <textarea value={task} onChange={e=>setTask(e.target.value)} placeholder="Например: реши уравнение 3x + 5 = 20 и объясни каждый шаг…"/>
        <div className="row"><span className="hint">Подробное объяснение, не только ответ</span><button className="btn" onClick={()=>onQuickSolve({subject,grade,task})}>Решить задание →</button></div>
      </Panel>
      <Panel title="Учебный кабинет" description="Твоя учебная статистика.">
        <div className="statgrid"><div className="stat"><b>{taskCount??"—"}</b><small>Заданий</small></div><div className="stat"><b>6</b><small>Предметов</small></div></div>
        <div className="listrow">Supabase: {configured?"подключён":"ожидает настройки"}</div>
      </Panel>
    </div>
  </section>;
}
function Solver({ initialSubject, initialTask, initialGrade, onSaved }) {
  const [subject,setSubject]=useState(initialSubject||"english");
  const [grade,setGrade]=useState("7");
  const [mode,setMode]=useState("detailed");
  const [task,setTask]=useState(initialTask||"");
  const [imageFile,setImageFile]=useState(null);
  const [imageData,setImageData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [solution,setSolution]=useState(null);
  useEffect(()=>{if(initialSubject)setSubject(initialSubject);},[initialSubject]);
  useEffect(()=>{if(initialTask)setTask(initialTask);},[initialTask]);
  function chooseImage(file) {
    setError("");setSolution(null);
    if(!file){setImageFile(null);setImageData(null);return;}
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024){setError("Файл должен быть PNG/JPG/WEBP до 5 МБ.");return;}
    const reader=new FileReader();reader.onload=()=>{setImageData(reader.result);setImageFile(file);};reader.onerror=()=>setError("Не удалось прочитать изображение.");reader.readAsDataURL(file);
  }
  async function submit(e) {
    e.preventDefault();setError("");setSolution(null);
    if(!task.trim()&&!imageData){setError("Добавь текст или фотографию задания.");return;}
    if(!supabase){setError("Supabase не подключён. Настрой .env.local.");return;}
    setLoading(true);
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){setError("Для AI-решения войди в аккаунт в разделе «Профиль».");return;}
      const {data,error:invokeError}=await supabase.functions.invoke(aiFunctionName,{body:{subject,grade:Number(grade),mode,task:task.trim(),imageDataUrl:imageData}});
      if(invokeError)throw invokeError;
      const result=data.solution||data;setSolution(result);
      const {error:saveError}=await supabase.from("solutions").insert({subject_id:subject,grade:Number(grade),task_text:task.trim()||"Задание по фото",mode,result});
      if(saveError)throw saveError;
      onSaved?.();
    } catch(err){setError(err.message||"Не удалось получить решение. Проверь AI Function и секреты Supabase.");}
    finally{setLoading(false);}
  }
  return <section className="view active"><Panel title="AI-решатель" description="Текст или фото задания · класс · режим объяснения.">
    <form onSubmit={submit}>
      <div className="controls"><SubjectSelect value={subject} onChange={setSubject}/><GradeSelect value={grade} onChange={setGrade}/>
        <Select value={mode} onChange={setMode}>{MODES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Select>
      </div>
      <textarea value={task} onChange={e=>setTask(e.target.value)} placeholder="Напиши условие задания или вопрос…"/>
      <div className="row"><label className="file">Фото (PNG/JPG/WEBP до 5 МБ) <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseImage(e.target.files?.[0])}/></label>
        <button className="btn" type="submit" disabled={loading}>{loading?"AI решает…":"Объяснить решение →"}</button></div>
      {imageFile&&<p className="hint">{imageFile.name} <button className="btn secondary" type="button" onClick={()=>chooseImage(null)}>Убрать фото</button></p>}
    </form>
    {error&&<div className="notice" role="alert">{error}</div>}
    {loading&&<div className="empty">Анализируем задание…</div>}
    <SolutionView solution={solution}/>
    <div className="notice">AI может ошибаться. Проверяй важные определения и формулы по учебнику.</div>
  </Panel></section>;
}
function Knowledge({ formulas=false }) {
  const [subject,setSubject]=useState("english"),[grade,setGrade]=useState("7"),[term,setTerm]=useState(""),[items,setItems]=useState([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  const load=useCallback(async()=>{
    if(!supabase){setItems([]);setError("Подключи Supabase для загрузки материалов.");return;}
    setLoading(true);setError("");
    try {
      let query=formulas
        ?supabase.from("formulas").select("title,expression,explanation,topics!inner(subject_id,grade)").eq("status","published").eq("topics.subject_id",subject).eq("topics.grade",Number(grade)).limit(50)
        :supabase.from("knowledge_items").select("title,content,item_type,topics!inner(subject_id,grade)").eq("status","published").eq("topics.subject_id",subject).eq("topics.grade",Number(grade)).limit(40);
      if(term&&!formulas)query=query.ilike("title","%"+term+"%");
      const {data,error:queryError}=await query;if(queryError)throw queryError;setItems(data||[]);
    }catch(err){setError(err.message||"Ошибка загрузки.");}finally{setLoading(false);}
  },[formulas,subject,grade,term]);
  useEffect(()=>{load();},[load]);
  return <section className="view active"><Panel title={formulas?"Центр формул и правил":"Библиотека знаний"} description={formulas?"Формулы, обозначения, условия применения и примеры.":"Опубликованные и проверенные учебные материалы."}>
    <div className="controls"><SubjectSelect value={subject} onChange={setSubject}/><GradeSelect value={grade} onChange={setGrade}/>{!formulas&&<input className="field" value={term} onChange={e=>setTerm(e.target.value)} placeholder="Поиск по названию"/>}</div>
    {loading?<div className="empty">Загрузка…</div>:error?<div className="notice">{error}</div>:items.length?items.map((x,i)=><div className="listrow" key={i}><b>{x.title}</b>{formulas?<><p><code>{x.expression}</code></p>{x.explanation}</>:<p>{x.content}</p>}</div>):<div className="empty">Для выбранного класса пока нет опубликованных материалов.</div>}
  </Panel></section>;
}
function makeExercise(subject) {
  const a=3+Math.floor(Math.random()*8), b=2+Math.floor(Math.random()*9), n=2+Math.floor(Math.random()*8);
  const bank={
    algebra:{question:`Реши уравнение: ${a}x + ${b} = ${a*n+b}`,answer:String(n),hint:`Вычти ${b} из обеих частей, затем раздели результат на ${a}.`},
    geometry:{question:`У прямоугольника стороны ${a} см и ${b} см. Найди периметр.`,answer:String(2*(a+b)),hint:`Формула: P = 2(a + b). Подставь значения сторон.`},
    physics:{question:`Тело прошло ${a*10} м за ${b*2} с. Найди среднюю скорость в м/с.`,answer:String(Number((a*5/b).toFixed(2))),hint:`Используй формулу v = s / t. Раздели путь на время.`},
    chemistry:{question:"Сколько атомов водорода содержит одна молекула воды H₂O?",answer:"2",hint:"Индекс 2 у H показывает два атома водорода. У кислорода индекс не указан — он один."},
    english:{question:"Выбери правильную форму: She ___ to school every day. (go / goes)",answer:"goes",hint:"В Present Simple с he / she / it к глаголу обычно добавляется -s или -es."},
    ukrainian:{question:"Визнач частину мови слова «швидко».",answer:"прислівник",hint:"Слово «швидко» відповідає на питання «як?» і називає ознаку дії."}
  };
  return bank[subject]||bank.algebra;
}
function Practice() {
  const [subject,setSubject]=useState("algebra"),[grade,setGrade]=useState("7");
  const [exercise,setExercise]=useState(null),[answer,setAnswer]=useState(""),[checked,setChecked]=useState(false),[score,setScore]=useState(0),[attempts,setAttempts]=useState(0);
  const normalize=v=>String(v).trim().toLocaleLowerCase().replace(",",".");
  function next(){setExercise(makeExercise(subject));setAnswer("");setChecked(false);}
  function check(){if(!exercise||!answer.trim()||checked)return;setChecked(true);setAttempts(x=>x+1);if(normalize(answer)===normalize(exercise.answer))setScore(x=>x+1);}
  return <section className="view active"><Panel title="Тренажёр знаний" description="Решай короткие задания и сразу проверяй себя.">
    <div className="controls"><SubjectSelect value={subject} onChange={v=>{setSubject(v);setExercise(null);setChecked(false);setAnswer("");}}/><GradeSelect value={grade} onChange={v=>{setGrade(v);setExercise(null);setChecked(false);}}/></div>
    <div className="practice-stats"><span>Попыток: <b>{attempts}</b></span><span>Верно: <b>{score}</b></span></div>
    {!exercise?<div className="empty">Нажми «Новое задание», чтобы начать тренировку.</div>:<div className="exercise-card"><span className="eyebrow">ПРАКТИКА · {grade} КЛАСС</span><h4>{exercise.question}</h4><input className="field answer-input" value={answer} onChange={e=>setAnswer(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")check();}} placeholder="Твой ответ" aria-label="Твой ответ" disabled={checked}/>{checked&&<div className={normalize(answer)===normalize(exercise.answer)?"feedback correct":"feedback incorrect"}>{normalize(answer)===normalize(exercise.answer)?"Верно! Отличная работа.":`Правильный ответ: ${exercise.answer}`}<p>{exercise.hint}</p></div>}</div>}
    <div className="row"><button className="btn" onClick={next}>Новое задание →</button><button className="btn secondary" disabled={!exercise||!answer.trim()||checked} onClick={check}>Проверить ответ</button></div>
    <p className="hint">Упражнения работают без базы данных. Результаты тренажёра пока не сохраняются после перезагрузки страницы.</p>
  </Panel></section>;
}
function AuthProfile({ user, onRefresh }) {
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function auth(action){setMessage("");if(!supabase){setMessage("Сначала настрой Supabase.");return;}if(!email.trim()||password.length<8){setMessage("Укажи почту и пароль от 8 символов.");return;}setBusy(true);try{const result=action==="register"?await supabase.auth.signUp({email:email.trim(),password}):await supabase.auth.signInWithPassword({email:email.trim(),password});if(result.error)throw result.error;if(action==="register"&&!result.data.session)setMessage("Проверь почту для подтверждения регистрации.");await onRefresh();}catch(err){setMessage(err.message||"Ошибка авторизации.");}finally{setBusy(false);}}
  return <section className="view active"><Panel title="Профиль ученика">
    {user?<><div className="listrow">Выполнен вход: {user.email}</div><button className="btn secondary" onClick={logout}>Выйти</button></>:<>
      <p className="desc">Войди, чтобы сохранять историю и прогресс.</p>
      <div className="auth"><input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Электронная почта"/>
      <input className="field" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль (от 8 символов)"/>
      <button className="btn" disabled={busy} onClick={()=>auth("login")}>Войти</button><button className="btn secondary" disabled={busy} onClick={()=>auth("register")}>Регистрация</button></div>
    </>}
    {message&&<div className="notice" role="alert">{message}</div>}
    <div className="notice">Не используй чужие персональные данные и не делись паролем.</div>
  </Panel></section>;
}
function UserData({ user, refreshKey, type }) {
  const [items,setItems]=useState([]),[count,setCount]=useState(0),[error,setError]=useState("");
  useEffect(()=>{let active=true;async function load(){if(!supabase||!user){setItems([]);setCount(0);return;}const {data,count:total,error:err}=await supabase.from("solutions").select("id,subject_id,task_text,created_at",{count:"exact"}).order("created_at",{ascending:false}).limit(50);if(!active)return;if(err)setError(err.message);else{setItems(data||[]);setCount(total??data?.length??0);}}load();return()=>{active=false;};},[user,refreshKey]);
  if(!user)return <div className="empty">Войди и решай задания, чтобы собирать статистику.</div>;
  if(error)return <div className="notice">{error}</div>;
  if(type==="progress")return <div className="stat"><b>{count}</b><small>Сохранено решений</small></div>;
  return items.length?items.map(x=><div className="listrow" key={x.id}>{x.task_text} · {new Date(x.created_at).toLocaleDateString()}</div>):<div className="empty">Пока нет сохранённых заданий.</div>;
}
export default function App() {
  const [page,setPage]=useState("dashboard"),[user,setUser]=useState(null),[refreshKey,setRefreshKey]=useState(0);
  const [selectedSubject,setSelectedSubject]=useState("english"),[initialTask,setInitialTask]=useState(""),[selectedGrade,setSelectedGrade]=useState(7);
  const [taskCount,setTaskCount]=useState(null);
  const configured=useMemo(()=>isSupabaseConfigured,[ ]);
  const refresh=useCallback(async()=>{if(!supabase)return;const {data:{session}}=await supabase.auth.getSession();setUser(session?.user||null);setRefreshKey(x=>x+1);},[]);
  useEffect(()=>{if(!supabase)return;refresh();const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);setRefreshKey(x=>x+1);});return()=>subscription.unsubscribe();},[refresh]);
  useEffect(()=>{let active=true;async function load(){if(!supabase||!user){setTaskCount(null);return;}const {count}=await supabase.from("solutions").select("id",{count:"exact",head:true});if(active)setTaskCount(count??0);}load();return()=>{active=false;};},[user,refreshKey]);
  const titles={dashboard:"Добро пожаловать!",solver:"AI-решатель",knowledge:"Библиотека знаний",formulas:"Формулы и правила",practice:"Тренажёр",progress:"Мой прогресс",history:"История заданий",profile:"Профиль ученика"};
  function chooseSubject(id){setSelectedSubject(id);setInitialTask("");setPage("solver");}
  function quickSolve({subject,grade,task}){setSelectedSubject(subject);setSelectedGrade(Number(grade));setInitialTask(task);setPage("solver");}
  return <div className="shell">
    <aside className="side"><div className="brand">AI SCHOOL ASSISTANT<small>Умный помощник · 5–11 классы</small></div>
      <nav className="nav">{NAV.map(([id,icon,label])=><button key={id} onClick={()=>setPage(id)} className={page===id?"active":""}>{icon} &nbsp; {label}</button>)}</nav>
      <div className="side-note">Учись с пониманием.<br/>AI объясняет ход решения, а не только ответ.</div>
    </aside>
    <main className="main"><header className="top"><div><div className="eyebrow">ТВОЙ ПЕРСОНАЛЬНЫЙ РЕПЕТИТОР</div><h1>{titles[page]}</h1></div>
      <span className="pill">{configured?"Supabase настроен":"Демо · Supabase не подключён"}</span></header>
      {page==="dashboard"&&<Dashboard onChoose={chooseSubject} onQuickSolve={quickSolve} taskCount={taskCount} configured={configured}/>}
      {page==="solver"&&<Solver key={selectedSubject+initialTask+selectedGrade} initialSubject={selectedSubject} initialTask={initialTask} initialGrade={selectedGrade} onSaved={()=>setRefreshKey(x=>x+1)}/>}
      {page==="knowledge"&&<Knowledge/>}
      {page==="formulas"&&<Knowledge formulas/>}
      {page==="practice"&&<Practice/>}
      {page==="progress"&&<section className="view active"><Panel title="Мой прогресс"><UserData user={user} refreshKey={refreshKey} type="progress"/></Panel></section>}
      {page==="history"&&<section className="view active"><Panel title="История заданий"><UserData user={user} refreshKey={refreshKey} type="history"/></Panel></section>}
      {page==="profile"&&<AuthProfile user={user} onRefresh={refresh}/>}
    </main>
  </div>;
}
