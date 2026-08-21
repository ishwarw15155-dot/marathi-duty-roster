/* v13.9: New week clears weekly duties/notes/EL-ML range, while preserving नैर/जमा/रुजू. */
import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Sanscript from "@indic-transliteration/sanscript";
import {
  CalendarDays, Download, FileDown, FileText, Plus, Printer, Save,
  Trash2, Upload, RotateCcw, Copy, Check, Bold, Minus,
  Plus as PlusIcon, Settings2, X, LogIn, LogOut, FolderOpen
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import "./styles.css";

const DAYS = ["सोम","मंगळ","बुध","गुरु","शुक्र","शनि","रवि"];
const DAY_NAMES = ["रवि","सोम","मंगळ","बुध","गुरु","शुक्र","शनि"];

const DEFAULT_DUTIES = [
  { key:"morning", label:"सकाळ", abbr:"M", description:"Morning", login:"", logout:"", includeInSummary:true },
  { key:"evening", label:"दुपार", abbr:"E", description:"Evening", login:"", logout:"", includeInSummary:true },
  { key:"night", label:"रापा", abbr:"N", description:"Night", login:"", logout:"", includeInSummary:true },
  { key:"nightoff", label:"रासू", abbr:"NO", description:"Night Off", login:"", logout:"", includeInSummary:true },
  { key:"leave", label:"रजा", abbr:"L", description:"Leave", login:"", logout:"", includeInSummary:true, countsAsHoliday:false }
];

const DEFAULT_POSTS = ["परिसेवक","अधिपरिचारिका","कक्षसेवक","सफाईगार"];
const HOLIDAY_CODES = new Set(["PH","SS","FS","CL"]);
const LEAVE_CODES = new Set(["L","EL","ML"]);

function getPosts(roster){
  return Array.isArray(roster.posts) && roster.posts.length
    ? roster.posts
    : DEFAULT_POSTS;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function newEmployee(group="अधिपरिचारिका") {
  return {
    id:createId(),
    group,
    rollNo:"",
    englishName:"",
    marathiName:"",
    gender:"male",
    nair:"",
    jama:"",
    ruju:"",
    leaveType:"",
    leaveFrom:"",
    leaveTo:"",
    marathiFontSize:16,
    marathiBold:false,
    duties:Array(7).fill(""),
    customNotes:Array(7).fill("")
  };
}

function blankRoster() {
  return {
    hospital:"ससून सर्वोपचार रुग्णालय, पुणे",
    department:"मनोरुग्णशास्त्र विभाग",
    ward:"कक्ष क्र. २६",
    title:"परिसेवक / अधिपरिचारिका कामाचे साप्ताहिक वेळापत्रक",
    from:"",
    to:"",
    posts:[...DEFAULT_POSTS],
    employees:[
      newEmployee("परिसेवक"),
      newEmployee("अधिपरिचारिका"),
      newEmployee("कक्षसेवक"),
      newEmployee("सफाईगार")
    ],
    duties:DEFAULT_DUTIES.map(d=>({...d})),
    fontFamily:"Mukta",
    globalFontSize:16,
    fontSizes:{
      hospital:18,
      department:18,
      ward:16,
      title:15,
      date:13,
      headerAll:11,
      group:12,
      rollNumber:10.5,
      staffName:16,
      dutyCode:12,
      extraValue:10.5,
      summaryLabel:10.5,
        summaryCount:11,
      summaryAbbr:8
    },
    tableSizes:{
      sr:40,
      roll:58,
      name:165,
      day:49,
      extra:40,
      row:29,
      headerRow:43,
      summaryHeaderRow:37,
      summaryRow:30,
      groupRow:33
    },
    pdfTypography:{
      header:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      rollNumber:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      date:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      dutyCode:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      extraValue:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      summaryLabel:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      summaryCount:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400},
      staffName:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400}
    },
    savedAt:null
  };
}

function normalizeRoster(data={}) {
  const base=blankRoster();
  const duties=Array.isArray(data.duties)&&data.duties.length
    ? data.duties.map(d=>({
        key:d.key||createId(),
        label:d.label||"ड्युटी",
        abbr:d.abbr||"D",
        description:d.description||"",
        login:d.login||"",
        logout:d.logout||"",
        includeInSummary: typeof d.includeInSummary === "boolean" ? d.includeInSummary : ["morning","evening","night","nightoff","leave"].includes(d.key),
        countsAsHoliday: typeof d.countsAsHoliday === "boolean" ? d.countsAsHoliday : HOLIDAY_CODES.has(String(d.abbr||"").trim().toUpperCase())
      }))
    : base.duties;

  const posts=Array.isArray(data.posts)&&data.posts.length
    ? [...data.posts]
    : [...DEFAULT_POSTS];

  const employees=Array.isArray(data.employees)
    ? data.employees.map(e=>({
        ...newEmployee(e.group||"अधिपरिचारिका"),
        ...e,
        duties:Array.isArray(e.duties)
          ? [...e.duties,...Array(7).fill("")].slice(0,7)
          : Array(7).fill(""),
        customNotes:Array.isArray(e.customNotes)
          ? [...e.customNotes,...Array(7).fill("")].slice(0,7)
          : Array(7).fill(""),
        marathiFontSize:e.marathiFontSize||16,
        marathiBold:!!e.marathiBold,
        gender:e.gender||"male",
        nair:e.nair||"",
        jama:e.jama||"",
        ruju:e.ruju||"",
        leaveType:e.leaveType||"",
        leaveFrom:e.leaveFrom||"",
        leaveTo:e.leaveTo||""
      }))
    : base.employees;

  const tableSizes={
    ...base.tableSizes,
    ...(data.tableSizes||{})
  };

  const pdfTypography={
    ...base.pdfTypography,
    ...(data.pdfTypography||{}),
    header:{
      ...base.pdfTypography.header,
      ...(data.pdfTypography?.header||{})
    },
    rollNumber:{
      ...base.pdfTypography.rollNumber,
      ...(data.pdfTypography?.rollNumber||{})
    },
    date:{
      ...base.pdfTypography.date,
      ...(data.pdfTypography?.date||{})
    },
    dutyCode:{
      ...base.pdfTypography.dutyCode,
      ...(data.pdfTypography?.dutyCode||{})
    },
    extraValue:{
      ...base.pdfTypography.extraValue,
      ...(data.pdfTypography?.extraValue||{})
    },
    summaryLabel:{
      ...base.pdfTypography.summaryLabel,
      ...(data.pdfTypography?.summaryLabel||{})
    },
    summaryCount:{
      ...base.pdfTypography.summaryCount,
      ...(data.pdfTypography?.summaryCount||{})
    },
    staffName:{
      ...base.pdfTypography.staffName,
      ...(data.pdfTypography?.staffName||{})
    }
  };

  Object.keys(tableSizes).forEach(key=>{
    const mins={
      sr:30, roll:40, name:110, day:35, extra:25,
      row:22, headerRow:30, summaryHeaderRow:28,
      summaryRow:22, groupRow:24
    };
    const maxs={
      sr:80, roll:100, name:260, day:90, extra:70,
      row:60, headerRow:70, summaryHeaderRow:65,
      summaryRow:55, groupRow:60
    };
    tableSizes[key]=Math.max(
      mins[key] ?? 20,
      Math.min(
        maxs[key] ?? 100,
        Number(tableSizes[key]) || base.tableSizes[key]
      )
    );
  });

  return {
    ...base,
    ...data,
    fontFamily:data.fontFamily||base.fontFamily,
    globalFontSize:Math.max(12,Math.min(24,Number(data.globalFontSize)||base.globalFontSize)),
    tableSizes,
    pdfTypography,
    fontSizes:{
      ...base.fontSizes,
      ...(data.fontSizes||{}),
      headerAll:Number(data.fontSizes?.headerAll)
        || Number(data.fontSizes?.headerDay)
        || base.fontSizes.headerAll
    },
    duties,
    posts,
    employees,
    savedAt:data.savedAt||null
  };
}

const SUMMARY_DEFAULT_KEYS = new Set(["morning","evening","night","nightoff","leave"]);
function isoDateForDay(from, dayIndex){
  if(!from || dayIndex<0) return "";
  const d=new Date(`${from}T00:00:00`);
  d.setDate(d.getDate()+dayIndex);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getLeaveCodeForDay(employee, from, dayIndex){
  if(!employee?.leaveType || !employee?.leaveFrom || !employee?.leaveTo) return "";
  const date=isoDateForDay(from,dayIndex);
  if(!date) return "";
  if(date>=employee.leaveFrom && date<=employee.leaveTo){
    return employee.leaveType==="ML" ? "ML" : "EL";
  }
  return "";
}

function formatDateRange(from,to){
  if(!from || !to) return "";
  return `${formatDate(from)} ते ${formatDate(to)}`;
}

function dutyCode(duty){
  return String(duty?.abbr||"").trim().toUpperCase();
}

function isHolidayDuty(duty){
  return HOLIDAY_CODES.has(dutyCode(duty));
}

function isLeaveDuty(duty){
  return LEAVE_CODES.has(dutyCode(duty));
}

function isSummaryExcludedEmployee(employee){
  const group=String(employee?.group||"")
    .trim()
    .toLowerCase()
    .replace(/\s+/g," " );

  return (
    group.includes("परिसेवक") ||
    group==="incharge" ||
    group.includes("in-charge") ||
    group.includes("in charge")
  );
}

function formatDate(value) {
  if (!value) return "";
  const [y,m,d]=value.split("-");
  return `${d}/${m}/${y}`;
}

function makeDateLabels(from) {
  if (!from) return DAYS.map(d=>({short:d,date:""}));
  const start=new Date(`${from}T00:00:00`);
  return Array.from({length:7},(_,i)=>{
    const date=new Date(start);
    date.setDate(start.getDate()+i);
    return {
      short:DAY_NAMES[date.getDay()],
      date:`${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}`
    };
  });
}

function cleanMarathiText(text) {
  return (text||"")
    .replace(/्(?=\s|$)/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function transliterateName(name) {
  if (!name?.trim()) return "";
  if (/[\u0900-\u097F]/.test(name)) return cleanMarathiText(name);
  try {
    return cleanMarathiText(Sanscript.t(name,"itrans","devanagari"));
  } catch {
    return name;
  }
}

function honorific(gender){
  if(gender==="female") return "श्रीमती.";
  if(gender==="male") return "श्री.";
  return "";
}

function displayStaffName(employee){
  const name=cleanMarathiText(employee?.marathiName || employee?.englishName || "");
  if(!name) return "—";
  const clean=name.replace(/^(श्री\.?|श्रीमती\.?|कु\.?|सौ\.?)\s*/," ").trim();
  const prefix=honorific(employee?.gender);
  return prefix ? `${prefix} ${clean}` : clean;
}

function App({user,onLogout,selectedWardId=null,selectedWardName="",selectedRosterType="regular"}) {
  const userRole=String(user?.role||"").trim().toLowerCase();
  const isWardUser=userRole==="ward";
  const [wardRosterType,setWardRosterType]=useState("regular");
  const rosterType=isWardUser
    ? (wardRosterType==="servant" ? "servant" : "regular")
    : (selectedRosterType==="servant" ? "servant" : "regular");
  const isServantRoster=rosterType==="servant";

  const cloudWardId=
    selectedWardId ||
    user?.ward_id ||
    user?.ward?.id ||
    null;

  const isCloudRoster=
    userRole==="ward" ||
    !!selectedWardId;

  const [roster,setRoster]=useState(()=>{
    if(isCloudRoster){
      return blankRoster();
    }

    try{
      const raw=
        localStorage.getItem("marathi-duty-roster-v7") ||
        localStorage.getItem("marathi-duty-roster-v6") ||
        localStorage.getItem("marathi-duty-roster-v5");

      return raw
        ? normalizeRoster(JSON.parse(raw))
        : blankRoster();

    }catch{
      return blankRoster();
    }
  });

  const [cloudLoading,setCloudLoading]=useState(isCloudRoster);
  const [cloudError,setCloudError]=useState("");

  const [tab,setTab]=useState("editor");
  const [savedMessage,setSavedMessage]=useState(false);
  const [showDutyManager,setShowDutyManager]=useState(false);
  const [showPostManager,setShowPostManager]=useState(false);
  const [showWardTemplates,setShowWardTemplates]=useState(false);
  const [staffSearch,setStaffSearch]=useState("");
  const [templateWard,setTemplateWard]=useState("");
  const paperRef=useRef(null);
  const [showHistory,setShowHistory]=useState(false);
  const [showFontSettings,setShowFontSettings]=useState(false);

  useEffect(()=>{
    if(!isCloudRoster || !cloudWardId){
      setCloudLoading(false);
      return;
    }

    let cancelled=false;

    const loadCloudRoster=async()=>{
      setCloudLoading(true);
      setCloudError("");

      try{
        const res=await fetch(
          `/api/ward-roster?wardId=${encodeURIComponent(cloudWardId)}`,
          {
            method:"GET",
            credentials:"include"
          }
        );

        const data=await res.json().catch(()=>({}));

        if(!res.ok){
          throw new Error(
            data.error||"Unable to load ward roster."
          );
        }

        if(cancelled){
          return;
        }

        const stored=
          data?.roster &&
          typeof data.roster==="object"
            ? data.roster
            : {};

        let loaded=stored;

        if(stored.__rosterVersion===2){
          loaded=stored[rosterType] || {};
        }else if(rosterType==="servant"){
          loaded={};
        }

        setRoster(
          normalizeRoster(loaded)
        );

      }catch(error){
        if(!cancelled){
          setCloudError(
            error.message||
            "Unable to load ward roster."
          );
        }
      }finally{
        if(!cancelled){
          setCloudLoading(false);
        }
      }
    };

    loadCloudRoster();

    return()=>{
      cancelled=true;
    };
  },[isCloudRoster,cloudWardId,rosterType]);

  useEffect(()=>{
    if(!isCloudRoster){
      localStorage.setItem(
        "marathi-duty-roster-v7",
        JSON.stringify(roster)
      );
    }
  },[roster,isCloudRoster]);

  const dayLabels=useMemo(()=>makeDateLabels(roster.from),[roster.from]);

  const update=(field,value)=>setRoster(r=>({...r,[field]:value}));

  const editEmployee=(id,field,value)=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{...e,[field]:value}:e)
  }));

  const editEnglish=(id,value)=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{
      ...e,
      englishName:value,
      marathiName:value.trim()?transliterateName(value):""
    }:e)
  }));

  const generateMarathi=id=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{
      ...e,
      marathiName:transliterateName(e.englishName)
    }:e)
  }));

  const changeFont=(id,delta)=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{
      ...e,
      marathiFontSize:Math.max(10,Math.min(32,(e.marathiFontSize||16)+delta))
    }:e)
  }));

  const toggleBold=id=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{
      ...e,
      marathiBold:!e.marathiBold
    }:e)
  }));

  const editDuty=(id,day,value)=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{
      ...e,
      duties:e.duties.map((d,i)=>i===day?value:d)
    }:e)
  }));

  const editNote=(id,day,value)=>setRoster(r=>({
    ...r,
    employees:r.employees.map(e=>e.id===id?{
      ...e,
      customNotes:e.customNotes.map((d,i)=>i===day?value:d)
    }:e)
  }));

  const addPost=()=>{
    const name=prompt("नवीन Post नाव भरा:", "नवीन पद");
    if(!name?.trim()) return;

    const post=name.trim();

    setRoster(r=>({
      ...r,
      posts:Array.from(new Set([...getPosts(r),post]))
    }));
  };

  const renamePost=(oldPost)=>{
    const next=prompt("Post चे नवीन नाव:",oldPost);
    if(!next?.trim() || next.trim()===oldPost) return;

    setRoster(r=>({
      ...r,
      posts:getPosts(r).map(p=>p===oldPost?next.trim():p),
      employees:r.employees.map(e=>
        e.group===oldPost
          ? {...e,group:next.trim()}
          : e
      )
    }));
  };

  const deletePost=(post)=>{
    if(getPosts(roster).length<=1){
      alert("किमान एक Post असणे आवश्यक आहे.");
      return;
    }

    const users=roster.employees.filter(e=>e.group===post).length;

    if(users && !confirm(
      `${post} मध्ये ${users} कर्मचारी आहेत. Post delete करायचे का?`
    )) return;

    setRoster(r=>({
      ...r,
      posts:getPosts(r).filter(p=>p!==post),
      employees:r.employees.map(e=>
        e.group===post
          ? {...e,group:getPosts(r).find(p=>p!==post)||"परिसेवक"}
          : e
      )
    }));
  };

  const addEmployee=group=>setRoster(r=>({
    ...r,
    employees:[...r.employees,newEmployee(group)]
  }));

  const insertEmployee=(index,group)=>setRoster(r=>{
    const list=[...r.employees];
    list.splice(index,0,newEmployee(group));
    return {...r,employees:list};
  });

  const moveEmployee=(id,direction)=>{
    setRoster(r=>{
      const index=r.employees.findIndex(e=>e.id===id);
      const nextIndex=index+direction;
      if(index<0 || nextIndex<0 || nextIndex>=r.employees.length)return r;
      const list=[...r.employees];
      [list[index],list[nextIndex]]=[list[nextIndex],list[index]];
      return {...r,employees:list};
    });
  };

  const removeEmployee=id=>{
    if(roster.employees.length<=1){
      alert("किमान एक कर्मचारी असणे आवश्यक आहे.");
      return;
    }
    setRoster(r=>({
      ...r,
      employees:r.employees.filter(e=>e.id!==id)
    }));
  };

  const duplicateEmployees=()=>setRoster(r=>({
    ...r,
    employees:[
      ...r.employees,
      ...r.employees.map(e=>({
        ...e,
        id:createId(),
        duties:Array(7).fill(""),
        customNotes:Array(7).fill("")
      }))
    ]
  }));

  const addDuty=()=>setRoster(r=>({
    ...r,
    duties:[
      ...r.duties,
      {
        key:createId(),
        label:"नवीन ड्युटी",
        abbr:"D",
        description:"",
        login:"",
        logout:"",
        includeInSummary:false
      }
    ]
  }));

  const updateDutyDef=(key,field,value)=>setRoster(r=>({
    ...r,
    duties:r.duties.map(d=>d.key===key?{...d,[field]:value}:d)
  }));

  const deleteDuty=key=>{
    if(roster.duties.length<=1){
      alert("किमान एक duty असणे आवश्यक आहे.");
      return;
    }
    setRoster(r=>({
      ...r,
      duties:r.duties.filter(d=>d.key!==key),
      employees:r.employees.map(e=>({
        ...e,
        duties:e.duties.map(v=>v===key?"":v)
      }))
    }));
  };

  const wardTemplateKey=ward=>{
    const clean=(ward||"Ward").trim().toLowerCase();
    return `marathi-duty-template:${clean}`;
  };

  const saveWardTemplate=()=>{
    const ward=roster.ward.trim();
    if(!ward){
      alert("कृपया Ward / Room नाव भरा.");
      return;
    }

    const template={
      ward,
      hospital:roster.hospital,
      department:roster.department,
      title:roster.title,
      posts:getPosts(roster),
      duties:roster.duties,
      employees:roster.employees.map(e=>({
        ...e,
        duties:Array(7).fill(""),
        customNotes:Array(7).fill("")
      })),
      savedAt:new Date().toISOString()
    };

    localStorage.setItem(
      wardTemplateKey(ward),
      JSON.stringify(template)
    );

    alert(`Ward template saved for ${ward}.`);
  };

  const loadWardTemplate=ward=>{
    const target=(ward||roster.ward).trim();
    if(!target){
      alert("कृपया Ward / Room निवडा.");
      return;
    }

    const raw=localStorage.getItem(wardTemplateKey(target));

    if(!raw){
      alert(`Ward ${target} साठी saved template सापडले नाही.`);
      return;
    }

    try{
      const template=normalizeRoster(JSON.parse(raw));
      setRoster(r=>({
        ...r,
        hospital:template.hospital||r.hospital,
        department:template.department||r.department,
        ward:template.ward||target,
        title:template.title||r.title,
        posts:template.posts||getPosts(r),
        duties:template.duties,
        employees:template.employees.map(e=>({
          ...e,
          duties:Array(7).fill(""),
          customNotes:Array(7).fill("")
        })),
        from:"",
        to:"",
        savedAt:null
      }));
      setShowWardTemplates(false);
      setTab("editor");
    }catch{
      alert("Ward template वाचता आले नाही.");
    }
  };

  const startNextWeek=()=>{
    setRoster(r=>({
      ...r,
      from:"",
      to:"",
      employees:r.employees.map(e=>({
        ...e,
        // New week: clear only week-specific daily entries/notes and leave range.
        // Keep staff identity, post, font settings, and नैर/जमा/रुजू values.
        duties:Array(7).fill(""),
        customNotes:Array(7).fill(""),
        leaveType:"",
        leaveFrom:"",
        leaveTo:""
      })),
      savedAt:null
    }));
    setTab("editor");
  };

  const getHistory=()=>{
    try{
      return JSON.parse(localStorage.getItem("marathi-duty-history-v7")||"[]");
    }catch{
      return [];
    }
  };

  const saveWeeklyHistory=()=>{
    if(!roster.from){
      alert("कृपया From Date निवडा.");
      return;
    }

    const history=getHistory();
    const item={
      id:createId(),
      savedAt:new Date().toISOString(),
      from:roster.from,
      to:roster.to,
      ward:roster.ward,
      department:roster.department,
      hospital:roster.hospital,
      title:roster.title,
      employees:roster.employees,
      duties:roster.duties
    };

    const filtered=history.filter(
      h=>!(h.ward===item.ward && h.from===item.from)
    );

    filtered.unshift(item);

    localStorage.setItem(
      "marathi-duty-history-v7",
      JSON.stringify(filtered.slice(0,100))
    );

    alert("Weekly roster saved to history.");
  };

  const loadHistoryItem=item=>{
    setRoster(normalizeRoster(item));
    setShowHistory(false);
    setTab("editor");
  };

  const deleteHistoryItem=id=>{
    const next=getHistory().filter(h=>h.id!==id);
    localStorage.setItem(
      "marathi-duty-history-v7",
      JSON.stringify(next)
    );
  };

  const nextWeekFromDate=()=>{
    if(!roster.from){
      startNextWeek();
      return;
    }

    const d=new Date(`${roster.from}T00:00:00`);
    d.setDate(d.getDate()+7);

    const end=new Date(d);
    end.setDate(end.getDate()+6);

    const iso=x=>
      `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;

    setRoster(r=>({
      ...r,
      from:iso(d),
      to:iso(end),
      employees:r.employees.map(e=>({
        ...e,
        duties:Array(7).fill(""),
        customNotes:Array(7).fill("")
      })),
      savedAt:null
    }));

    setTab("editor");
  };

  const save=async()=>{
    const next={
      ...roster,
      savedAt:new Date().toISOString()
    };

    setRoster(next);

    if(isCloudRoster && cloudWardId){
      try{
        setCloudError("");

        const existingRes=await fetch(
          `/api/ward-roster?wardId=${encodeURIComponent(cloudWardId)}`,
          {method:"GET",credentials:"include"}
        );
        const existingData=await existingRes.json().catch(()=>({}));
        if(!existingRes.ok){
          throw new Error(existingData.error||"Unable to load existing ward roster.");
        }

        const existingStored=
          existingData?.roster &&
          typeof existingData.roster==="object"
            ? existingData.roster
            : {};

        const combined=
          existingStored.__rosterVersion===2
            ? {...existingStored,[rosterType]:next}
            : rosterType==="regular"
              ? {__rosterVersion:2,regular:next,servant:{}}
              : {__rosterVersion:2,regular:existingStored,servant:next};

        const res=await fetch(
          "/api/ward-roster",
          {
            method:"POST",
            credentials:"include",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({wardId:cloudWardId,roster:combined})
          }
        );

        const data=await res.json().catch(()=>({}));

        if(!res.ok){
          throw new Error(
            data.error||
            "Unable to save ward roster."
          );
        }

      }catch(error){
        setCloudError(
          error.message||
          "Unable to save ward roster."
        );
        return;
      }
    }else{
      localStorage.setItem(
        "marathi-duty-roster-v7",
        JSON.stringify(next)
      );
    }

    setSavedMessage(true);
    setTimeout(()=>{
      setSavedMessage(false);
    },1800);
  };

  const newRoster=()=>{
    if(confirm("नवीन रिकामी ड्युटी यादी तयार करायची आहे का?")){
      setRoster(blankRoster());
      setTab("editor");
    }
  };

  const backup=()=>{
    const blob=new Blob(
      [JSON.stringify(roster,null,2)],
      {type:"application/json"}
    );
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`duty-roster-${roster.from||"new"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore=e=>{
    const file=e.target.files?.[0];
    if(!file)return;

    const reader=new FileReader();
    reader.onload=()=>{
      try{
        setRoster(normalizeRoster(JSON.parse(reader.result)));
        setTab("editor");
      }catch{
        alert("ही वैध roster JSON फाइल नाही.");
      }
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const print=()=>{
    setTab("preview");
    setTimeout(()=>window.print(),300);
  };

  const generatePdf=async()=>{
    if(!paperRef.current)return;

    try{
      const canvas=await html2canvas(
        paperRef.current,
        {
          scale:2.5,
          backgroundColor:"#fff",
          useCORS:true,
          logging:false,
          windowWidth:paperRef.current.scrollWidth
        }
      );

      const pdf=new jsPDF({
        orientation:"portrait",
        unit:"mm",
        format:"a4"
      });

      const margin=7;
      const width=210-margin*2;
      const pxPerMm=canvas.width/width;
      const pagePx=Math.floor((297-margin*2)*pxPerMm);

      let offset=0;
      let page=0;

      while(offset<canvas.height){
        const h=Math.min(pagePx,canvas.height-offset);

        const c=document.createElement("canvas");
        c.width=canvas.width;
        c.height=h;

        const ctx=c.getContext("2d");
        ctx.fillStyle="#fff";
        ctx.fillRect(0,0,c.width,c.height);

        ctx.drawImage(
          canvas,
          0,offset,canvas.width,h,
          0,0,canvas.width,h
        );

        if(page++)pdf.addPage();

        pdf.addImage(
          c.toDataURL("image/png"),
          "PNG",
          margin,
          margin,
          width,
          h/pxPerMm
        );

        offset+=h;
      }

      pdf.save(`duty-roster-${roster.from||"a4"}.pdf`);
    }catch(error){
      console.error(error);
      alert("PDF तयार करताना समस्या आली.");
    }
  };

  if(cloudLoading){
    return (
      <div
        className="login-loading"
        style={{minHeight:"100vh"}}
      >
        Loading ward roster...
      </div>
    );
  }

  if(cloudError){
    return (
      <div
        className="login-screen"
        style={{minHeight:"100vh"}}
      >
        <div className="login-card">
          <h2>Ward Roster Error</h2>

          <p style={{
            color:"#b42318",
            marginBottom:16
          }}>
            {cloudError}
          </p>

          {selectedWardId&&(
            <button
              className="dark-btn"
              onClick={()=>{
                sessionStorage.removeItem("admin_selected_ward_id");
                sessionStorage.removeItem("admin_selected_ward_name");
                sessionStorage.removeItem("admin_selected_roster_type");
                window.location.href="/";
              }}
            >
              Back to Ward Manager
            </button>
          )}
        </div>
      </div>
    );
  }

  return <div className="app" style={{"--marathi-font":fontStack(roster.fontFamily),"--ui-scale":(roster.globalFontSize||16)/16,"--ui-inverse-scale":16/(roster.globalFontSize||16)}}>

    <header className="topbar">
      <div>
        <div className="brand">Duty Roster</div>
        <div className="brand-sub">
          Marathi Hospital Weekly Duty List
        </div>
      </div>

      <div className="top-actions">
        <span className="logged-user">{user?.name||user?.username}</span>

        {isWardUser && (
          <>
            <button
              onClick={()=>setWardRosterType("regular")}
              className={wardRosterType==="regular" ? "dark-btn" : ""}
            >
              Regular Duty List
            </button>

            <button
              onClick={()=>setWardRosterType("servant")}
              className={wardRosterType==="servant" ? "dark-btn" : ""}
            >
              Servant Duty List
            </button>
          </>
        )}

        <button onClick={onLogout} className="logout-btn">
          <LogOut size={16}/>
          Logout
        </button>

        {selectedWardId&&(
          <button
            onClick={()=>{
              sessionStorage.removeItem("admin_selected_ward_id");
              sessionStorage.removeItem("admin_selected_ward_name");
              window.location.href="/";
            }}
          >
            <FolderOpen size={16}/>
            Back to Ward Manager
          </button>
        )}

        <button onClick={()=>setShowFontSettings(true)}>
          <Settings2 size={16}/>
          Font Settings
        </button>

        <button
          onClick={save}
          className={savedMessage?"saved-btn":""}
        >
          {savedMessage?<Check size={16}/>:<Save size={16}/>}
          {savedMessage?"Saved":"Save"}
        </button>

        <button onClick={print}>
          <Printer size={16}/>
          Print
        </button>

        <button onClick={generatePdf} className="dark-btn">
          <FileText size={16}/>
          A4 PDF
        </button>
      </div>
    </header>

    <main className="layout">

      <section className="main-panel">

        <div className="tabs">
          <button
            className={tab==="editor"?"active":""}
            onClick={()=>setTab("editor")}
          >
            Roster Editor
          </button>

          <button
            className={tab==="preview"?"active":""}
            onClick={()=>setTab("preview")}
          >
            A4 Preview
          </button>
        </div>

        {tab==="editor"?<>

          <div className="heading">
            <h1>{isServantRoster ? "Servant Duty List" : "Create Duty List"}</h1>
            <p>
              Ward template वापरून पुढील आठवड्यात staff list पुन्हा वापरता येईल.
            </p>
          </div>

          <div className="form-grid">

            <Field
              label="Hospital Name"
              value={roster.hospital}
              onChange={v=>update("hospital",v)}
              sizeKey="hospital"
              fontSizes={roster.fontSizes}
              onSizeChange={(key,v)=>setRoster(r=>({...r,fontSizes:{...r.fontSizes,[key]:v}}))}
            />

            <Field
              label="Department Name"
              value={roster.department}
              onChange={v=>update("department",v)}
              sizeKey="department"
              fontSizes={roster.fontSizes}
              onSizeChange={(key,v)=>setRoster(r=>({...r,fontSizes:{...r.fontSizes,[key]:v}}))}
            />

            <Field
              label="Ward / Room"
              value={roster.ward}
              onChange={v=>update("ward",v)}
              sizeKey="ward"
              fontSizes={roster.fontSizes}
              onSizeChange={(key,v)=>setRoster(r=>({...r,fontSizes:{...r.fontSizes,[key]:v}}))}
            />

            <Field
              label="Roster Title"
              value={roster.title}
              wide
              onChange={v=>update("title",v)}
              sizeKey="title"
              fontSizes={roster.fontSizes}
              onSizeChange={(key,v)=>setRoster(r=>({...r,fontSizes:{...r.fontSizes,[key]:v}}))}
            />

            <Field
              label="From Date"
              type="date"
              value={roster.from}
              sizeKey="date"
              fontSizes={roster.fontSizes}
              onSizeChange={(key,v)=>setRoster(r=>({...r,fontSizes:{...r.fontSizes,[key]:v}}))}
              onChange={v=>{
                if(!v){
                  update("from","");
                  update("to","");
                  return;
                }
                const d=new Date(`${v}T00:00:00`);
                d.setDate(d.getDate()+6);
                const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
                setRoster(r=>({...r,from:v,to:iso(d)}));
              }}
            />

            <Field
              label="To Date"
              type="date"
              value={roster.to}
              onChange={v=>update("to",v)}
              sizeKey="date"
              fontSizes={roster.fontSizes}
              onSizeChange={(key,v)=>setRoster(r=>({...r,fontSizes:{...r.fontSizes,[key]:v}}))}
            />

          </div>

          <A4SizeControls
            fontSizes={roster.fontSizes}
            onChange={(key,v)=>setRoster(r=>({
              ...r,
              fontSizes:{
                ...r.fontSizes,
                [key]:Math.max(7,Math.min(40,Number(v)||r.fontSizes?.[key]||12))
              }
            }))}
          />

          <TableSizeControls
            tableSizes={roster.tableSizes}
            isServant={isServantRoster}
            onChange={(key,v)=>setRoster(r=>({
              ...r,
              tableSizes:{
                ...r.tableSizes,
                [key]:v
              }
            }))}
          />

          <div className="date-hint">
            From Date निवडल्यानंतर To Date आपोआप 7 दिवसांच्या roster प्रमाणे भरली जाईल.
          </div>

          <div className="section-head">

            <div>
              <h2>Employees / कर्मचारी</h2>
              <p>
                प्रत्येक नावाच्या Before / After बटणाने नवीन staff कुठेही घालता येईल.
              </p>
            </div>

            <div className="staff-toolbar">

              <div className="staff-search">
                <input
                  value={staffSearch}
                  onChange={e=>setStaffSearch(e.target.value)}
                  placeholder="कर्मचारी शोधा..."
                />
                {staffSearch && (
                  <button
                    className="clear-search"
                    onClick={()=>setStaffSearch("")}
                  >
                    <X size={13}/>
                  </button>
                )}
              </div>

              <div className="inline-actions">

              <button onClick={()=>addEmployee("कक्षसेवक")}>
                <Plus size={15}/>
                कक्षसेवक
              </button>

              <button onClick={()=>addEmployee("सफाईगार")}>
                <Plus size={15}/>
                सफाईगार
              </button>

              <button onClick={()=>setShowPostManager(true)}>
                <Settings2 size={15}/>
                Manage Posts
              </button>

              <button onClick={addPost}>
                <Plus size={15}/>
                Custom Post
              </button>

              <button onClick={duplicateEmployees}>
                <Copy size={15}/>
                Duplicate
              </button>

              <button onClick={saveWardTemplate}>
                <Save size={15}/>
                Save Ward Template
              </button>

              <button onClick={()=>setShowWardTemplates(true)}>
                <FolderOpen size={15}/>
                Ward Templates
              </button>

              <button onClick={nextWeekFromDate}>
                <CalendarDays size={15}/>
                Next Week
              </button>

              <button onClick={()=>setShowHistory(true)}>
                <FolderOpen size={15}/>
                Weekly History
              </button>

              </div>
            </div>
          </div>

          <div className="employee-table-wrap">

            <table className="employee-table">

              <thead>
                <tr>
                  <th>#</th>
                  <th>वर्ग</th>
                  {!isServantRoster && <th>Roll No.</th>}
                  <th>लिंग / Gender</th>
                  <th>English Name</th>
                  <th>मराठी नाव / Style</th>
                  {!isServantRoster && <th>नैर</th>}
                  <th>जमा</th>
                  {!isServantRoster && <th>रुजू</th>}
                  <th>Insert / Delete</th>
                </tr>
              </thead>

              <tbody>

                {roster.employees
                  .map((e,i)=>({...e,__index:i}))
                  .filter(e=>{
                    const q=staffSearch.trim().toLowerCase();
                    if(!q)return true;
                    return [
                      e.englishName,e.marathiName,e.rollNo,e.group
                    ].some(v=>(v||"").toLowerCase().includes(q));
                  })
                  .map(e=><tr key={e.id}>

                  <td>{e.__index+1}</td>

                  <td>
                    <select
                      value={e.group}
                      onChange={x=>editEmployee(e.id,"group",x.target.value)}
                    >
                      {getPosts(roster).map(g=><option key={g}>{g}</option>)}
                    </select>
                  </td>

                  {!isServantRoster && (
                    <td>
                      <input
                        value={e.rollNo}
                        placeholder="2/114"
                        onChange={x=>editEmployee(e.id,"rollNo",x.target.value)}
                      />
                    </td>
                  )}

                  <td>
                    <select
                      value={e.gender||"male"}
                      onChange={x=>editEmployee(e.id,"gender",x.target.value)}
                      title="Gender / लिंग"
                    >
                      <option value="male">पुरुष</option>
                      <option value="female">स्त्री</option>
                      <option value="other">इतर</option>
                    </select>
                  </td>

                  <td>
                    <input
                      value={e.englishName}
                      placeholder="Sagar Walhekar"
                      onChange={x=>editEnglish(e.id,x.target.value)}
                    />
                  </td>

                  <td>

                    <div className="marathi-name-editor">

                      <div className="marathi-input-row">

                        <input
                          className="marathi-input"
                          value={e.marathiName}
                          placeholder="सागर वाल्हेकर"
                          style={{
                            fontSize:`${e.marathiFontSize||16}px`,
                            fontWeight:e.marathiBold?700:400
                          }}
                          onChange={x=>editEmployee(e.id,"marathiName",x.target.value)}
                        />

                        <button
                          className="generate-marathi"
                          onClick={()=>generateMarathi(e.id)}
                        >
                          मराठी
                        </button>

                      </div>

                      <div className="name-style-controls">

                        <button
                          className={e.marathiBold?"style-active":""}
                          title="Bold"
                          onClick={()=>toggleBold(e.id)}
                        >
                          <Bold size={15}/>
                        </button>

                        <button
                          title="Decrease font size"
                          onClick={()=>changeFont(e.id,-1)}
                        >
                          <Minus size={14}/>
                        </button>

                        <span>{e.marathiFontSize||16}px</span>

                        <button
                          title="Increase font size"
                          onClick={()=>changeFont(e.id,1)}
                        >
                          <PlusIcon size={14}/>
                        </button>

                      </div>

                      <div className="leave-inline-controls">
                        <select
                          value={e.leaveType||""}
                          onChange={x=>editEmployee(e.id,"leaveType",x.target.value)}
                          title="EL / ML leave range"
                        >
                          <option value="">Leave: None</option>
                          <option value="EL">EL — Earn Leave</option>
                          <option value="ML">ML — Medical Leave</option>
                        </select>
                        <input
                          type="date"
                          value={e.leaveFrom||""}
                          onChange={x=>editEmployee(e.id,"leaveFrom",x.target.value)}
                          title="Leave From"
                        />
                        <span>to</span>
                        <input
                          type="date"
                          value={e.leaveTo||""}
                          onChange={x=>editEmployee(e.id,"leaveTo",x.target.value)}
                          title="Leave To"
                        />
                      </div>
                      {e.leaveType && e.leaveFrom && e.leaveTo &&
                        <div className="leave-range-preview">
                          {e.leaveType==="ML" ? "ON MEDICAL LEAVE" : "ON EL"} {formatDateRange(e.leaveFrom,e.leaveTo)}
                        </div>
                      }
                    </div>

                  </td>

                  {!isServantRoster && <td><input value={e.nair||""} placeholder="" onChange={x=>editEmployee(e.id,"nair",x.target.value)} />
                  </td>}
                  <td><input value={e.jama||""} placeholder="" onChange={x=>editEmployee(e.id,"jama",x.target.value)} /></td>
                  {!isServantRoster && <td><input value={e.ruju||""} placeholder="" onChange={x=>editEmployee(e.id,"ruju",x.target.value)} />
                  </td>}

                  <td>

                    <div className="row-actions">

                      <button
                        className="insert-btn move-btn"
                        title="Move staff up"
                        onClick={()=>moveEmployee(e.id,-1)}
                      >
                        ↑
                      </button>

                      <button
                        className="insert-btn move-btn"
                        title="Move staff down"
                        onClick={()=>moveEmployee(e.id,1)}
                      >
                        ↓
                      </button>

                      <button
                        className="insert-btn"
                        title="Add staff before"
                        onClick={()=>insertEmployee(e.__index,e.group)}
                      >
                        + Before
                      </button>

                      <button
                        className="insert-btn"
                        title="Add staff after"
                        onClick={()=>insertEmployee(e.__index+1,e.group)}
                      >
                        + After
                      </button>

                      <button
                        className="delete-btn"
                        title="Delete staff"
                        onClick={()=>removeEmployee(e.id)}
                      >
                        <Trash2 size={16}/>
                      </button>

                    </div>

                  </td>

                </tr>)}

              </tbody>

            </table>
          </div>

          <div className="section-head duty-head">

            <div>
              <h2>Duty Assignment / ड्युटी</h2>
              <p>
                M = सकाळ, E = दुपार, N = रापा, NO = रासू, L = रजा. EL/ML leave range ही फक्त नावाच्या row मध्ये माहिती म्हणून दिसेल; duty cells आपोआप बदलणार नाहीत.
              </p>
            </div>

            <button
              onClick={()=>setShowDutyManager(true)}
              className="manage-duty"
            >
              <Settings2 size={15}/>
              Manage Duties
            </button>

          </div>

          <div className="assignment-wrap">

            <table className="assignment-table">

              <thead>
                <tr>
                  <th className="assign-name">नाव</th>

                  {dayLabels.map((d,i)=>
                    <th key={i}>
                      {d.short}
                      <small>{d.date}</small>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>

                {roster.employees.map(e=><tr key={e.id}>

                  <td className="assign-name">
                    {displayStaffName(e)}
                  </td>

                  {e.duties.map((v,i)=>{
                    return <td key={i}>
                      <select
                        value={v}
                        onChange={x=>editDuty(e.id,i,x.target.value)}
                      >
                        <option value="">—</option>
                        {roster.duties.map(d=>
                          <option value={d.key} key={d.key}>
                            {d.abbr} — {d.label}
                          </option>
                        )}
                      </select>
                      {v &&
                        <input
                          className="day-note"
                          placeholder="note"
                          value={e.customNotes[i]||""}
                          onChange={x=>editNote(e.id,i,x.target.value)}
                        />
                      }
                    </td>;
                  })}

                </tr>)}

              </tbody>

            </table>

          </div>

          <div className="bottom-actions">

            <button onClick={newRoster}>
              <RotateCcw size={16}/>
              New Roster
            </button>

            <button onClick={saveWeeklyHistory}>
              <Save size={16}/>
              Save Week History
            </button>

            <button onClick={backup}>
              <Download size={16}/>
              Backup JSON
            </button>

            <label className="upload-btn">
              <Upload size={16}/>
              Restore JSON
              <input
                type="file"
                accept=".json"
                onChange={restore}
              />
            </label>

          </div>

        </>:<>

          <div className="preview-area">

            <div className="preview-bar">

              <div>
                <b>A4 Portrait Preview</b>
                <span>
                  {" "}— रवि नंतर एकूण column नाही आणि A4 च्या शेवटी duty-code legend नाही.
                </span>
              </div>

              <button
                className="dark-btn"
                onClick={generatePdf}
              >
                <FileDown size={16}/>
                Generate PDF
              </button>

            </div>

            <div className="paper-stage">

              <PrintableRoster
                ref={paperRef}
                roster={roster}
                labels={dayLabels}
                rosterType={rosterType}
              />

            </div>

          </div>

        </>}

      </section>

      <aside className="side-panel">

        <div className="side-block">
          <h3>Ward Templates</h3>
          <p>
            Ward 26 ची staff list एकदा Save Ward Template करा.
            पुढील आठवड्यात Ward Templates मधून ती पुन्हा load करा.
          </p>
        </div>

        <div className="side-block">
          <h3>Posts / पदे</h3>
          <p>
            परिसेवक, अधिपरिचारिका, कक्षसेवक आणि सफाईगार
            default आहेत. Manage Posts मधून custom post जोडता येईल.
          </p>
        </div>

        <div className="side-block">
          <h3>Staff insertion</h3>
          <p>
            कोणत्याही नावाच्या row वर <b>+ Before</b> किंवा
            <b> + After</b> वापरून नवीन कर्मचारी घालता येईल.
          </p>
        </div>

        <div className="side-block">
          <h3>Summary</h3>
          <p>
            Summary मध्ये सोम ते रवि हे main table प्रमाणेच
            त्याच columns खाली येतात. शेवटी एकूण column नाही.
          </p>
        </div>

      </aside>

    </main>

    {showDutyManager &&
      <DutyManager
        roster={roster}
        onClose={()=>setShowDutyManager(false)}
        onAdd={addDuty}
        onUpdate={updateDutyDef}
        onDelete={deleteDuty}
      />
    }

    {showPostManager &&
      <PostManager
        roster={roster}
        onClose={()=>setShowPostManager(false)}
        onAdd={addPost}
        onRename={renamePost}
        onDelete={deletePost}
      />
    }

    {showWardTemplates &&
      <WardTemplatesModal
        currentWard={roster.ward}
        onClose={()=>setShowWardTemplates(false)}
        onLoad={loadWardTemplate}
      />
    }

    {showHistory &&
      <WeeklyHistoryModal
        onClose={()=>setShowHistory(false)}
        onLoad={loadHistoryItem}
        onDelete={deleteHistoryItem}
      />
    }

    {showFontSettings &&
      <FontSettingsModal
        value={roster.fontFamily}
        onChange={v=>update("fontFamily",v)}
        pdfTypography={roster.pdfTypography}
        onTypographyChange={(key,field,value)=>setRoster(r=>({
          ...r,
          pdfTypography:{
            ...r.pdfTypography,
            [key]:{
              ...r.pdfTypography?.[key],
              [field]:value
            }
          }
        }))}
        onClose={()=>setShowFontSettings(false)}
      />
    }

  </div>;
}


const FONT_OPTIONS = [
  {value:"Mukta", label:"Mukta", sample:"सकाळ दुपार रापा रासू रजा"},
  {value:"Noto Sans Devanagari", label:"Noto Sans Devanagari", sample:"सकाळ दुपार रापा रासू रजा"},
  {value:"Tiro Devanagari Marathi", label:"Tiro Devanagari Marathi", sample:"सकाळ दुपार रापा रासू रजा"}
];

function fontStack(font){
  if(font==="Noto Sans Devanagari") return '"Noto Sans Devanagari","Mukta","Nirmala UI",sans-serif';
  if(font==="Tiro Devanagari Marathi") return '"Tiro Devanagari Marathi","Mukta","Noto Sans Devanagari","Nirmala UI",serif';
  return '"Mukta","Noto Sans Devanagari","Nirmala UI",sans-serif';
}

function FontSettingsModal({value,onChange,onClose,pdfTypography,onTypographyChange}){
  return <div className="modal-backdrop">
    <div className="font-modal">
      <div className="modal-head">
        <div>
          <h2>Marathi Font / मराठी फॉन्ट</h2>
          <p>Duty List आणि A4 Print/PDF साठी फॉन्ट निवडा.</p>
        </div>
        <button onClick={onClose}><X size={18}/></button>
      </div>

      <div className="font-options">
        {FONT_OPTIONS.map(font=><button key={font.value}
          className={`font-option ${value===font.value?"selected":""}`}
          onClick={()=>onChange(font.value)}
          style={{fontFamily:fontStack(font.value)}}>
          <span className="font-option-name">{font.label}</span>
          <span className="font-option-sample">{font.sample}</span>
        </button>)}
      </div>

      <div style={{
        margin:"0 16px 14px",
        padding:"13px",
        border:"1px solid #e0e5ea",
        borderRadius:8,
        background:"#fafbfc"
      }}>
        <b style={{fontSize:13}}>PDF Header Row / A4 Header Row</b>
        <div style={{fontSize:10,color:"#727d88",marginTop:3,marginBottom:10}}>
          अ क्र, रोल नं, नावे, सोम–रवि, नैर, जमा, रुजू या पूर्ण header row साठी एकच Font आणि Weight निवडा.
          Day name वर हीच setting लागू होईल; खालील date साठी Date setting स्वतंत्र आहे.
        </div>
        {["header","rollNumber","date","dutyCode","extraValue","summaryLabel","summaryCount","staffName"].map(key=>{
          const labels={
            header:"Header Row — अ क्र / रोल नं / नावे / सोम–रवि / नैर / जमा / रुजू",
            rollNumber:"रोल नं Values",
            date:"Dates — 24/08, 25/08...",
            dutyCode:"Duty Codes — M / E / PH / SS / DO",
            extraValue:"रुजू / नैर / जमा Values",
            summaryCount:"Summary Numbers",
            summaryLabel:"Summary Labels — सकाळ / दुपार / रापा / रासू / रजा / सुट्टया / एकूण",
            staffName:"Staff Names"
          };
          const item=pdfTypography?.[key]||{fontFamily:value,fontWeight:400};
          return <div key={key} style={{
            display:"grid",
            gridTemplateColumns:"1.7fr 1fr .8fr",
            gap:7,
            alignItems:"center",
            marginTop:7
          }}>
            <span style={{fontSize:11,fontWeight:600}}>{labels[key]}</span>
            <select
              value={item.fontFamily}
              onChange={e=>onTypographyChange(key,"fontFamily",e.target.value)}
            >
              {FONT_OPTIONS.map(font=><option key={font.value} value={font.value}>{font.label}</option>)}
            </select>
            <select
              value={String(item.fontWeight)}
              onChange={e=>onTypographyChange(key,"fontWeight",Number(e.target.value))}
            >
              <option value="400">Normal</option>
              <option value="500">Medium</option>
              <option value="600">Semi Bold</option>
              <option value="700">Bold</option>
            </select>
          </div>;
        })}
      </div>

      <div className="font-preview" style={{fontFamily:fontStack(value)}}>
        <b>Preview / नमुना</b>
        <div>श्री सागर वाल्हेकर — सकाळ (M) — सोम</div>
      </div>

      <div className="modal-foot">
        <button onClick={onClose}>Done / पूर्ण</button>
      </div>
    </div>
  </div>;
}

function LoginScreen({onLogin}){
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const submit=async e=>{
    e.preventDefault(); setError(""); setBusy(true);
    try{
      const res=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({username,password})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||"Login failed");
      onLogin(data.user);
    }catch(err){setError(err.message||"Login failed");}
    finally{setBusy(false);}
  };
  return <div className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="login-logo">Duty Roster</div>
      <h1>Hospital Duty List</h1>
      <p>कृपया Username आणि Password ने Login करा.</p>
      <label><span>Username</span><input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required/></label>
      <label><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
      {error&&<div className="login-error">{error}</div>}
      <button className="dark-btn login-btn" disabled={busy}><LogIn size={16}/>{busy?"Logging in...":"Login"}</button>
      <small className="login-note">Authorized user login</small>
    </form>
  </div>;
}


function AdminDashboard({user,onLogout}){
  const [wards,setWards]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [showCreate,setShowCreate]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [busy,setBusy]=useState(false);
  const [editBusy,setEditBusy]=useState(false);
  const [editWard,setEditWard]=useState(null);
  const [form,setForm]=useState({
    name:"",
    username:"",
    password:""
  });
  const [editForm,setEditForm]=useState({
    wardId:"",
    name:"",
    username:"",
    password:""
  });

  const loadWards=async()=>{
    setLoading(true);
    setError("");

    try{
      const res=await fetch("/api/list-wards",{
        method:"GET",
        credentials:"include"
      });

      const data=await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.error||"Unable to load wards."
        );
      }

      const list=Array.isArray(data)
        ? data
        : Array.isArray(data.wards)
          ? data.wards
          : Array.isArray(data.data)
            ? data.data
            : [];

      setWards(list);

    }catch(err){
      setError(
        err.message||"Unable to load wards."
      );
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{
    loadWards();
  },[]);

  const createWard=async e=>{
    e.preventDefault();

    if(
      !form.name.trim() ||
      !form.username.trim() ||
      !form.password
    ){
      setError(
        "Ward name, username and password are required."
      );
      return;
    }

    setBusy(true);
    setError("");

    try{
      const res=await fetch("/api/create-ward",{
        method:"POST",
        credentials:"include",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          wardName:form.name.trim(),
          wardCode:"",
          username:form.username.trim(),
          password:form.password
        })
      });

      const data=await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.error||"Unable to create ward."
        );
      }

      setForm({
        name:"",
        username:"",
        password:""
      });

      setShowCreate(false);

      await loadWards();

    }catch(err){
      setError(
        err.message||"Unable to create ward."
      );
    }finally{
      setBusy(false);
    }
  };

  const deleteWard=async ward=>{
    const wardId=
      ward?.id||
      ward?.ward_id||
      null;

    if(!wardId){
      setError("Ward ID is missing.");
      return;
    }

    const name=
      ward?.ward_name||
      ward?.name||
      ward?.ward||
      "this ward";

    if(
      !window.confirm(
        `Delete ${name}? This will remove the ward account and roster.`
      )
    ){
      return;
    }

    setError("");

    try{
      const res=await fetch("/api/delete-ward",{
        method:"DELETE",
        credentials:"include",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          wardId
        })
      });

      const data=await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.error||"Unable to delete ward."
        );
      }

      await loadWards();

    }catch(err){
      setError(
        err.message||"Unable to delete ward."
      );
    }
  };

  const toggleWard=async ward=>{
    const wardId=
      ward?.id||
      ward?.ward_id||
      null;

    if(!wardId){
      setError("Ward ID is missing.");
      return;
    }

    const active =
      typeof ward?.active==="boolean"
        ? ward.active
        : typeof ward?.is_active==="boolean"
          ? ward.is_active
          : true;

    setError("");

    try{
      const res=await fetch("/api/update-ward",{
        method:"PATCH",
        credentials:"include",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          wardId,
          wardName:
            ward?.ward_name||
            ward?.name||
            ward?.ward||
            "",
          wardCode:
            ward?.ward_code||
            "",
          username:
            ward?.username||
            "",
          active:!active
        })
      });

      const data=await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.error||"Unable to update ward."
        );
      }

      await loadWards();

    }catch(err){
      setError(
        err.message||"Unable to update ward."
      );
    }
  };

  const startEditWard=ward=>{
    const wardId=ward?.id||ward?.ward_id||null;
    if(!wardId){
      setError("Ward ID is missing.");
      return;
    }

    setError("");
    setEditWard(ward);
    setEditForm({
      wardId:String(wardId),
      name:String(ward?.ward_name||ward?.name||ward?.ward||""),
      username:String(ward?.username||ward?.email||""),
      password:""
    });
    setShowEdit(true);
  };

  const saveEditWard=async e=>{
    e.preventDefault();

    if(!editForm.wardId){
      setError("Ward ID is missing.");
      return;
    }

    if(!editForm.name.trim() || !editForm.username.trim()){
      setError("Ward name and username are required.");
      return;
    }

    if(editForm.password && editForm.password.length<6){
      setError("Ward password must be at least 6 characters.");
      return;
    }

    setEditBusy(true);
    setError("");

    try{
      const currentWard=editWard||{};
      const active =
        typeof currentWard.active==="boolean"
          ? currentWard.active
          : typeof currentWard.is_active==="boolean"
            ? currentWard.is_active
            : true;

      const res=await fetch("/api/update-ward",{
        method:"PATCH",
        credentials:"include",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          wardId:editForm.wardId,
          wardName:editForm.name.trim(),
          wardCode:currentWard?.ward_code||"",
          username:editForm.username.trim(),
          password:editForm.password,
          active
        })
      });

      const data=await res.json().catch(()=>({}));

      if(!res.ok){
        throw new Error(
          data.error||"Unable to update ward."
        );
      }

      setShowEdit(false);
      setEditWard(null);
      setEditForm({
        wardId:"",
        name:"",
        username:"",
        password:""
      });

      await loadWards();

    }catch(err){
      setError(
        err.message||"Unable to update ward."
      );
    }finally{
      setEditBusy(false);
    }
  };

  const openWard=(ward,type="regular")=>{
    const wardId=ward?.id||ward?.ward_id||null;
    if(!wardId){
      setError("Ward ID is missing.");
      return;
    }

    const wardName=String(ward?.ward_name||ward?.name||ward?.ward||"");

    sessionStorage.setItem("admin_selected_ward_id",String(wardId));
    sessionStorage.setItem("admin_selected_ward_name",wardName);
    sessionStorage.setItem("admin_selected_roster_type",type==="servant"?"servant":"regular");

    window.location.href=`/?ward=${encodeURIComponent(wardId)}&type=${type==="servant"?"servant":"regular"}`;
  };

  return (
    <div
      className="app"
      style={{
        minHeight:"100vh",
        background:"#f5f7fa"
      }}
    >
      <header className="topbar">
        <div>
          <div className="brand">
            Duty Roster
          </div>

          <div className="brand-sub">
            Administrator / Ward Manager
          </div>
        </div>

        <div className="top-actions">
          <span className="logged-user">
            {user?.name||
             user?.username||
             "Administrator"}
          </span>

          <button
            onClick={onLogout}
            className="logout-btn"
          >
            <LogOut size={16}/>
            Logout
          </button>
        </div>
      </header>

      <main
        style={{
          maxWidth:1100,
          margin:"0 auto",
          padding:"28px 18px"
        }}
      >
        <div
          style={{
            background:"#fff",
            borderRadius:16,
            padding:24,
            boxShadow:"0 8px 30px rgba(0,0,0,.08)"
          }}
        >
          <div
            style={{
              display:"flex",
              justifyContent:"space-between",
              alignItems:"center",
              gap:16,
              flexWrap:"wrap",
              marginBottom:20
            }}
          >
            <div>
              <h1
                style={{
                  margin:"0 0 6px"
                }}
              >
                Administrator / Ward Manager
              </h1>

              <p
                style={{
                  margin:0,
                  color:"#667085"
                }}
              >
                सर्व तयार केलेले wards येथे manage करा.
              </p>
            </div>

            <button
              className="dark-btn"
              onClick={()=>{
                setError("");
                setShowCreate(true);
              }}
            >
              <Plus size={16}/>
              Create New Ward
            </button>
          </div>

          {error&&(
            <div
              style={{
                padding:12,
                marginBottom:16,
                borderRadius:8,
                background:"#fff1f2",
                color:"#b42318"
              }}
            >
              {error}
            </div>
          )}

          {loading?(
            <div
              style={{
                padding:30,
                textAlign:"center"
              }}
            >
              Loading wards...
            </div>
          ):(
            <>
              <h2
                style={{
                  fontSize:18,
                  marginBottom:12
                }}
              >
                Created Wards{" "}
                <span
                  style={{
                    fontWeight:400,
                    color:"#667085"
                  }}
                >
                  {wards.length} wards
                </span>
              </h2>

              {wards.length===0?(
                <div
                  style={{
                    padding:30,
                    textAlign:"center",
                    border:"1px dashed #d0d5dd",
                    borderRadius:12,
                    color:"#667085"
                  }}
                >
                  <b>
                    No wards created yet.
                  </b>

                  <div
                    style={{
                      marginTop:6
                    }}
                  >
                    Create your first ward to start using the roster.
                  </div>
                </div>
              ):(
                <div
                  style={{
                    display:"grid",
                    gap:10
                  }}
                >
                  {wards.map((ward,index)=>{
                    const id=
                      ward.id||
                      ward.ward_id||
                      `ward-${index}`;

                    const name=
                      ward.ward_name||
                      ward.name||
                      ward.ward||
                      `Ward ${index+1}`;

                    const username=
                      ward.username||
                      ward.email||
                      "";

                    const active=
                      typeof ward.active==="boolean"
                        ? ward.active
                        : typeof ward.is_active==="boolean"
                          ? ward.is_active
                          : true;

                    return (
                      <div
                        key={id}
                        style={{
                          display:"flex",
                          alignItems:"center",
                          justifyContent:"space-between",
                          gap:12,
                          flexWrap:"wrap",
                          padding:16,
                          border:"1px solid #e4e7ec",
                          borderRadius:12
                        }}
                      >
                        <div>
                          <b>{name}</b>

                          {username&&(
                            <div
                              style={{
                                fontSize:13,
                                color:"#667085",
                                marginTop:3
                              }}
                            >
                              Username: {username}
                            </div>
                          )}

                          <div
                            style={{
                              fontSize:12,
                              marginTop:4,
                              color:
                                active
                                  ? "#027a48"
                                  : "#b42318"
                            }}
                          >
                            {active
                              ? "Active"
                              : "Inactive"}
                          </div>
                        </div>

                        <div
                          style={{
                            display:"flex",
                            gap:8,
                            flexWrap:"wrap"
                          }}
                        >
                          <button
                            onClick={()=>openWard(ward,"regular")}
                          >
                            Regular Duty List
                          </button>

                          <button
                            onClick={()=>openWard(ward,"servant")}
                          >
                            Servant Duty List
                          </button>

                          <button
                            onClick={()=>
                              startEditWard(ward)
                            }
                          >
                            Edit / Change Password
                          </button>

                          <button
                            onClick={()=>
                              toggleWard(ward)
                            }
                          >
                            {active
                              ? "Deactivate"
                              : "Activate"}
                          </button>

                          <button
                            className="delete-btn"
                            onClick={()=>
                              deleteWard(ward)
                            }
                          >
                            <Trash2 size={15}/>
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showCreate&&(
        <div className="modal-backdrop">
          <form
            className="ward-modal"
            onSubmit={createWard}
          >
            <div className="modal-head">
              <div>
                <h2>
                  Create New Ward
                </h2>

                <p>
                  Create one login for this ward.
                </p>
              </div>

              <button
                type="button"
                onClick={()=>{
                  if(!busy){
                    setShowCreate(false);
                  }
                }}
              >
                <X size={18}/>
              </button>
            </div>

            <div className="ward-modal-body">
              <label>
                <span>
                  Ward Name
                </span>

                <input
                  value={form.name}
                  onChange={e=>
                    setForm(f=>({
                      ...f,
                      name:e.target.value
                    }))
                  }
                  placeholder="Ward 26"
                  required
                />
              </label>

              <label>
                <span>
                  Username
                </span>

                <input
                  value={form.username}
                  onChange={e=>
                    setForm(f=>({
                      ...f,
                      username:e.target.value
                    }))
                  }
                  placeholder="ward26"
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                <span>
                  Password
                </span>

                <input
                  type="password"
                  value={form.password}
                  onChange={e=>
                    setForm(f=>({
                      ...f,
                      password:e.target.value
                    }))
                  }
                  placeholder="Create password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                onClick={()=>{
                  if(!busy){
                    setShowCreate(false);
                  }
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="dark-btn"
                disabled={busy}
              >
                {busy
                  ? "Creating..."
                  : "Create Ward"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showEdit&&(
        <div className="modal-backdrop">
          <form
            className="ward-modal"
            onSubmit={saveEditWard}
          >
            <div className="modal-head">
              <div>
                <h2>Edit Ward / Change Login</h2>
                <p>
                  Ward name, username आणि password बदलता येतील.
                </p>
              </div>

              <button
                type="button"
                onClick={()=>{
                  if(!editBusy){
                    setShowEdit(false);
                  }
                }}
              >
                <X size={18}/>
              </button>
            </div>

            <div className="ward-modal-body">
              <label>
                <span>Ward Name</span>
                <input
                  value={editForm.name}
                  onChange={e=>
                    setEditForm(f=>({
                      ...f,
                      name:e.target.value
                    }))
                  }
                  required
                />
              </label>

              <label>
                <span>Username</span>
                <input
                  value={editForm.username}
                  onChange={e=>
                    setEditForm(f=>({
                      ...f,
                      username:e.target.value
                    }))
                  }
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                <span>New Password</span>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={e=>
                    setEditForm(f=>({
                      ...f,
                      password:e.target.value
                    }))
                  }
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                onClick={()=>{
                  if(!editBusy){
                    setShowEdit(false);
                  }
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="dark-btn"
                disabled={editBusy}
              >
                {editBusy
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AppShell(){
  const [auth,setAuth]=useState(null);
  const [checking,setChecking]=useState(true);

  const [selectedWardId,setSelectedWardId]=useState(()=>{
    try{
      const params=new URLSearchParams(
        window.location.search
      );

      return (
        params.get("ward") ||
        sessionStorage.getItem(
          "admin_selected_ward_id"
        ) ||
        null
      );
    }catch{
      return null;
    }
  });

  const [selectedWardName,setSelectedWardName]=useState(()=>{
    try{
      return (
        sessionStorage.getItem(
          "admin_selected_ward_name"
        ) || ""
      );
    }catch{
      return "";
    }
  });

  const [selectedRosterType,setSelectedRosterType]=useState(()=>{
    try{
      const params=new URLSearchParams(window.location.search);
      return params.get("type")==="servant" || sessionStorage.getItem("admin_selected_roster_type")==="servant"
        ? "servant"
        : "regular";
    }catch{
      return "regular";
    }
  });

  const loadAuth=async()=>{
    try{
      const response=await fetch(
        "/api/me",
        {
          credentials:"include"
        }
      );

      const data=
        await response
          .json()
          .catch(()=>null);

      setAuth(
        response.ok
          ? (data?.user||null)
          : null
      );

    }catch{
      setAuth(null);
    }finally{
      setChecking(false);
    }
  };

  useEffect(()=>{
    loadAuth();
  },[]);

  const logout=async()=>{
    await fetch(
      "/api/logout",
      {
        method:"POST",
        credentials:"include"
      }
    ).catch(()=>{});

    sessionStorage.removeItem(
      "admin_selected_ward_id"
    );

    sessionStorage.removeItem(
      "admin_selected_ward_name"
    );
    sessionStorage.removeItem(
      "admin_selected_roster_type"
    );

    setSelectedWardId(null);
    setSelectedWardName("");
    setSelectedRosterType("regular");
    setAuth(null);
  };

  const backToAdmin=()=>{
    sessionStorage.removeItem(
      "admin_selected_ward_id"
    );

    sessionStorage.removeItem(
      "admin_selected_ward_name"
    );
    sessionStorage.removeItem(
      "admin_selected_roster_type"
    );

    setSelectedWardId(null);
    setSelectedWardName("");
    setSelectedRosterType("regular");

    window.history.replaceState(
      {},
      "",
      "/"
    );
  };

  if(checking){
    return (
      <div className="login-loading">
        Loading Duty Roster...
      </div>
    );
  }

  if(!auth){
    return (
      <LoginScreen
        onLogin={user=>{
          setAuth(user);
          setChecking(false);
        }}
      />
    );
  }

  const role=
    String(auth.role||"")
      .trim()
      .toLowerCase();

  if(
    (role==="admin"||role==="administrator") &&
    selectedWardId
  ){
    return (
      <App
        user={auth}
        onLogout={logout}
        selectedWardId={selectedWardId}
        selectedWardName={selectedWardName}
        selectedRosterType={selectedRosterType}
      />
    );
  }

  if(
    role==="admin"||
    role==="administrator"
  ){
    return (
      <AdminDashboard
        user={auth}
        onLogout={logout}
      />
    );
  }

  return (
    <App
      user={auth}
      onLogout={logout}
    />
  );
}

function SizeControl({value,onChange,min=7,max=40,small=false}) {
  const n=Number(value)||12;
  return (
    <div className={`inline-size-control ${small?"small":""}`}>
      <button type="button" title="Decrease size" onClick={()=>onChange(Math.max(min,n-1))}>−</button>
      <span>{n}px</span>
      <button type="button" title="Increase size" onClick={()=>onChange(Math.min(max,n+1))}>+</button>
    </div>
  );
}

function Field({label,value,onChange,type="text",wide=false,sizeKey,fontSizes,onSizeChange}) {
  return (
    <label className={wide?"wide-field":""}>
      <div className="field-label-row">
        <span>{label}</span>
        {sizeKey && fontSizes && onSizeChange &&
          <SizeControl
            value={fontSizes[sizeKey]}
            onChange={v=>onSizeChange(sizeKey,v)}
            small
          />
        }
      </div>

      <div className="input-wrap">
        {type==="date"&&<CalendarDays size={15}/>}

        <input
          type={type}
          value={value}
          onChange={e=>onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

function A4SizeControls({fontSizes,onChange}) {
  const groups=[
    {
      title:"A4 Header / शीर्षक",
      items:[
        ["hospital","Hospital Name"],
        ["department","Department"],
        ["ward","Ward"],
        ["title","Roster Title"],
        ["date","Date"]
      ]
    },
    {
      title:"Main Table / मुख्य टेबल",
      items:[
        ["headerAll","अ क्र / रोल नं / नावे / सोम–रवि + दिनांक / नैर / जमा / रुजू"],
        ["group","Post / Group"],
        ["rollNumber","Roll No."],
        ["dutyCode","Duty Code"],
        ["extraValue","जमा / रुजू values"],
        ["nairValue","नैर Values"]
      ]
    },
    {
      title:"Duty Summary / ड्युटी सारांश",
      items:[
        ["summaryLabel","सकाळ / दुपार / रापा / रासू / रजा / एकूण"],
        ["summaryCount","Summary Numbers"],
        ["summaryAbbr","M / E / N / NO / L"]
      ]
    }
  ];

  return (
    <div className="a4-size-panel">
      <div className="a4-size-panel-head">
        <div>
          <b>A4 Element Size / A4 प्रत्येक घटकाचा आकार</b>
          <span>प्रत्येक घटकाचा आकार येथेच बदलता येईल.</span>
        </div>
      </div>

      <div className="a4-size-groups">
        {groups.map(group=>
          <div className="a4-size-group" key={group.title}>
            <div className="a4-size-group-title">{group.title}</div>
            <div className="a4-size-items">
              {group.items.map(([key,label])=>
                <div className="a4-size-item" key={key}>
                  <span>{label}</span>
                  <SizeControl
                    value={fontSizes?.[key]||12}
                    onChange={v=>onChange(key,v)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="a4-size-linked-note">
        <b>सोम–रवि + दिनांक:</b> Main Table Header ची एकच size setting
        वापरली जाईल. त्यामुळे Main Table मधील <b>अ क्र, रोल नं, नावे,
        सोम–रवि + दिनांक, नैर, जमा, रुजू</b> आणि Summary मधील
        <b>सोम–रवि + दिनांक</b> यांचा font size आपोआप समान राहील.
      </div>
    </div>
  );
}

function TableSizeControl({label,value,onChange,min,max,step=1}) {
  const n=Number(value)||min;
  return (
    <div className="table-size-item">
      <div className="table-size-label">
        <span>{label}</span>
        <b>{n}px</b>
      </div>

      <div className="table-size-controls">
        <button
          type="button"
          onClick={()=>onChange(Math.max(min,n-step))}
        >
          −
        </button>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={n}
          onChange={e=>onChange(Number(e.target.value))}
        />

        <button
          type="button"
          onClick={()=>onChange(Math.min(max,n+step))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function TableSizeControls({tableSizes,isServant,onChange}) {
  const items=[
    ["sr","अ क्र column",30,80,1],

    ...(!isServant
      ? [["roll","रोल नं column",40,100,1]]
      : []),

    ["name","नावे / Name column",110,260,5],
    ["day","प्रत्येक दिवस column",35,90,1],

    ...(!isServant
      ? [["extra","नैर / जमा / रुजू column",25,70,1]]
      : [["extra","जमा column",25,70,1]]),

    ["row","Staff row height",22,60,1],
    ["headerRow","Main header height",30,70,1],
    ["groupRow","Post / Group row height",24,60,1],
    ["summaryHeaderRow","Summary header height",28,65,1],
    ["summaryRow","Summary row height",22,55,1]
  ];

  return (
    <div className="table-size-panel">
      <div className="table-size-panel-head">
        <div>
          <b>Table Width & Row Size / टेबलचा आकार</b>
          <span>
            {isServant
              ? "Servant Duty List"
              : "Regular Duty List"}
          </span>
        </div>
      </div>

      <div className="table-size-grid">
        {items.map(([key,label,min,max,step])=>(
          <TableSizeControl
            key={key}
            label={label}
            value={tableSizes?.[key] ?? min}
            onChange={v=>onChange(key,v)}
            min={min}
            max={max}
            step={step}
          />
        ))}
      </div>

      <div className="table-size-note">
        <b>टीप:</b> हे बदल A4 Preview आणि PDF मध्ये लागू होतील.
        प्रत्येक ward roster मध्ये ही settings जतन होतील.
      </div>
    </div>
  );
}

function DutyManager({roster,onClose,onAdd,onUpdate,onDelete}) {
  return (
    <div className="modal-backdrop">

      <div className="duty-modal">

        <div className="modal-head">

          <div>
            <h2>Manage Duties</h2>
            <p>
              Duty name, abbreviation, Login / Logout, Summary आणि सुट्टी (Off) मध्ये मोजायचे आहे का ते निवडा.
            </p>
          </div>

          <button onClick={onClose}>
            <X size={18}/>
          </button>

        </div>

        <div className="duty-list">

          <div className="duty-header-row">
            <span>Duty Name</span>
            <span>Code</span>
            <span>Description</span>
            <span>Login</span>
            <span>Logout</span>
            <span>Summary</span>
            <span>सुट्टी (Off)</span>
            <span></span>
          </div>

          {roster.duties.map(d=>
            <div className="duty-row" key={d.key}>

              <input
                value={d.label}
                onChange={e=>onUpdate(d.key,"label",e.target.value)}
                placeholder="सकाळ"
              />

              <input
                value={d.abbr}
                onChange={e=>onUpdate(d.key,"abbr",e.target.value)}
                placeholder="M"
              />

              <input
                value={d.description}
                onChange={e=>onUpdate(d.key,"description",e.target.value)}
                placeholder="Morning"
              />

              <div className="time-input">
                <LogIn size={14}/>
                <input
                  type="time"
                  value={d.login}
                  onChange={e=>onUpdate(d.key,"login",e.target.value)}
                />
              </div>

              <div className="time-input">
                <LogOut size={14}/>
                <input
                  type="time"
                  value={d.logout}
                  onChange={e=>onUpdate(d.key,"logout",e.target.value)}
                />
              </div>

              <label className="summary-check">
                <input
                  type="checkbox"
                  checked={!!d.includeInSummary}
                  onChange={e=>onUpdate(d.key,"includeInSummary",e.target.checked)}
                />
                <span>Include</span>
              </label>

              <label className="summary-check holiday-check">
                <input
                  type="checkbox"
                  checked={!!d.countsAsHoliday}
                  onChange={e=>onUpdate(d.key,"countsAsHoliday",e.target.checked)}
                />
                <span>Off</span>
              </label>

              <button
                className="delete-btn"
                onClick={()=>onDelete(d.key)}
              >
                <Trash2 size={16}/>
              </button>

            </div>
          )}

        </div>

        <div className="modal-foot">

          <button onClick={onAdd}>
            <Plus size={15}/>
            Add Custom Duty
          </button>

          <button className="dark-btn" onClick={onClose}>
            Done
          </button>

        </div>

      </div>
    </div>
  );
}

function PostManager({roster,onClose,onAdd,onRename,onDelete}) {
  const posts=getPosts(roster);

  return (
    <div className="modal-backdrop">

      <div className="ward-modal">

        <div className="modal-head">

          <div>
            <h2>Manage Posts / पदे</h2>
            <p>
              कक्षसेवक, सफाईगार किंवा तुमचे स्वतःचे Custom Post तयार करा.
            </p>
          </div>

          <button onClick={onClose}>
            <X size={18}/>
          </button>

        </div>

        <div className="ward-modal-body">

          <div className="saved-template-title">
            Available Posts
          </div>

          <div className="saved-template-list">

            {posts.map(post=>{

              const count=roster.employees.filter(
                e=>e.group===post
              ).length;

              return (
                <div className="saved-template-row" key={post}>

                  <div>
                    <b>{post}</b>
                    <small>{count} staff</small>
                  </div>

                  <div className="template-row-actions">

                    <button
                      onClick={()=>onRename(post)}
                    >
                      Rename
                    </button>

                    <button
                      className="danger-text"
                      onClick={()=>onDelete(post)}
                    >
                      Delete
                    </button>

                  </div>

                </div>
              );
            })}

          </div>

          <div className="template-help">
            <b>Default posts:</b>
            परिसेवक, अधिपरिचारिका, कक्षसेवक, सफाईगार.
            <br/>
            तुम्ही कोणतेही custom post उदा. वार्ड बॉय, आया,
            सुरक्षा रक्षक इत्यादी जोडू शकता.
          </div>

        </div>

        <div className="modal-foot">

          <button onClick={onAdd}>
            <Plus size={15}/>
            Add Custom Post
          </button>

          <button
            className="dark-btn"
            onClick={onClose}
          >
            Done
          </button>

        </div>

      </div>

    </div>
  );
}

function WardTemplatesModal({currentWard,onClose,onLoad}) {
  const [ward,setWard]=useState(currentWard||"");
  const [items,setItems]=useState([]);

  const refresh=()=>{
    const list=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key?.startsWith("marathi-duty-template:")) continue;
      try{
        list.push(JSON.parse(localStorage.getItem(key)));
      }catch{}
    }
    setItems(
      list.sort((a,b)=>
        (a.ward||"").localeCompare(b.ward||"")
      )
    );
  };

  useEffect(()=>{refresh()},[]);

  const rename=(oldWard)=>{
    const next=prompt("New Ward / Room name:",oldWard);
    if(!next?.trim() || next.trim()===oldWard) return;

    const oldKey=`marathi-duty-template:${oldWard.trim().toLowerCase()}`;
    const newKey=`marathi-duty-template:${next.trim().toLowerCase()}`;
    const raw=localStorage.getItem(oldKey);

    if(!raw)return;

    try{
      const data=JSON.parse(raw);
      data.ward=next.trim();
      localStorage.setItem(newKey,JSON.stringify(data));
      localStorage.removeItem(oldKey);
      refresh();
    }catch{
      alert("Could not rename this template.");
    }
  };

  const remove=(wardName)=>{
    if(!confirm(`Delete saved template for ${wardName}?`))return;

    localStorage.removeItem(
      `marathi-duty-template:${wardName.trim().toLowerCase()}`
    );

    refresh();
  };

  return (
    <div className="modal-backdrop">

      <div className="ward-modal">

        <div className="modal-head">

          <div>
            <h2>Ward Templates</h2>
            <p>Each ward keeps its own reusable staff list.</p>
          </div>

          <button onClick={onClose}>
            <X size={18}/>
          </button>

        </div>

        <div className="ward-modal-body">

          <label>
            <span>Load Ward</span>

            <div className="template-load-row">

              <input
                value={ward}
                onChange={e=>setWard(e.target.value)}
                placeholder="कक्ष क्र. २६"
              />

              <button
                className="dark-btn"
                onClick={()=>onLoad(ward)}
              >
                <FolderOpen size={15}/>
                Load
              </button>

            </div>

          </label>

          <div className="saved-template-title">
            Saved Wards
          </div>

          {items.length===0 ? (

            <div className="empty-template">
              No saved ward templates yet.
            </div>

          ) : (

            <div className="saved-template-list">

              {items.map(item=>
                <div className="saved-template-row" key={item.ward}>

                  <div>
                    <b>{item.ward}</b>
                    <small>
                      {item.employees?.length||0} staff
                    </small>
                  </div>

                  <div className="template-row-actions">

                    <button onClick={()=>onLoad(item.ward)}>
                      Load
                    </button>

                    <button onClick={()=>rename(item.ward)}>
                      Rename
                    </button>

                    <button
                      className="danger-text"
                      onClick={()=>remove(item.ward)}
                    >
                      Delete
                    </button>

                  </div>

                </div>
              )}

            </div>
          )}

          <div className="template-help">
            <b>Tip:</b> Save Ward Template after updating the permanent
            staff list. Loading a template clears dates and daily
            assignments, but keeps staff and duty definitions.
          </div>

        </div>

        <div className="modal-foot">
          <button onClick={onClose}>Close</button>
        </div>

      </div>

    </div>
  );
}

function WeeklyHistoryModal({onClose,onLoad,onDelete}) {
  const [items,setItems]=useState([]);

  const refresh=()=>{
    try{
      setItems(
        JSON.parse(
          localStorage.getItem("marathi-duty-history-v7")||"[]"
        )
      );
    }catch{
      setItems([]);
    }
  };

  useEffect(()=>{refresh()},[]);

  return (
    <div className="modal-backdrop">

      <div className="ward-modal history-modal">

        <div className="modal-head">

          <div>
            <h2>Weekly Roster History</h2>
            <p>Open a previous weekly duty list.</p>
          </div>

          <button onClick={onClose}>
            <X size={18}/>
          </button>

        </div>

        <div className="ward-modal-body">

          {items.length===0 ? (

            <div className="empty-template">
              No weekly rosters saved yet.
            </div>

          ) : (

            <div className="saved-template-list">

              {items.map(item=>
                <div className="saved-template-row" key={item.id}>

                  <div>
                    <b>{item.ward||"Ward"}</b>
                    <small>
                      {formatDate(item.from)}
                      {item.to?` — ${formatDate(item.to)}`:""}
                    </small>
                  </div>

                  <div className="template-row-actions">

                    <button onClick={()=>onLoad(item)}>
                      Open
                    </button>

                    <button
                      className="danger-text"
                      onClick={()=>{
                        onDelete(item.id);
                        refresh();
                      }}
                    >
                      Delete
                    </button>

                  </div>

                </div>
              )}

            </div>
          )}

        </div>

        <div className="modal-foot">
          <button onClick={onClose}>Close</button>
        </div>

      </div>

    </div>
  );
}

const PrintableRoster=forwardRef(function PrintableRoster({roster,labels,rosterType="regular"},ref){

  const isServantRoster=rosterType==="servant";

  const groups=getPosts(roster)
    .map(group=>({
      group,
      rows:roster.employees.filter(e=>e.group===group)
    }))
    .filter(g=>g.rows.length);

  const finalGroups=groups.length
    ? groups
    : [{group:"अधिपरिचारिका",rows:[newEmployee()]}];

  const dailyDutyCounts=Array.from(
    {length:7},
    ()=>Object.fromEntries(roster.duties.map(d=>[d.key,0]))
  );
  const dailyHolidayCounts=Array(7).fill(0);
  const dailyLeaveCounts=Array(7).fill(0);

  roster.employees.forEach(e=>{
    // Incharge / परिसेवक are operational staff and are intentionally
    // excluded from every summary count (duties, leave and holidays).
    if(isSummaryExcludedEmployee(e)){
      return;
    }

    // EL/ML date range contributes to the Leave summary,
    // but NEVER overwrites the employee's selected daily duty.
    e.duties.forEach((key,dayIndex)=>{
      if(key && dailyDutyCounts[dayIndex]?.[key]!==undefined){
        dailyDutyCounts[dayIndex][key]++;
        const duty=roster.duties.find(d=>d.key===key);
        if(isLeaveDuty(duty)) dailyLeaveCounts[dayIndex]++;
        if(isHolidayDuty(duty) || duty?.countsAsHoliday) dailyHolidayCounts[dayIndex]++;
      }
    });

    if(e.leaveType && e.leaveFrom && e.leaveTo){
      for(let dayIndex=0; dayIndex<7; dayIndex++){
        const date=isoDateForDay(roster.from,dayIndex);
        if(date && date>=e.leaveFrom && date<=e.leaveTo){
          dailyLeaveCounts[dayIndex]++;
        }
      }
    }
  });

  const summaryDuties=DEFAULT_DUTIES;
  const customSummaryDuties=roster.duties.filter(d=>!SUMMARY_DEFAULT_KEYS.has(d.key) && d.includeInSummary);

  const pdfTypography={
    header:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.header||{})},
    date:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.date||{})},
    dutyCode:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.dutyCode||{})},
    extraValue:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.extraValue||{})},
    summaryLabel:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.summaryLabel||{})},
    summaryCount:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.summaryCount||{})},
    staffName:{fontFamily:"Tiro Devanagari Marathi",fontWeight:400,...(roster.pdfTypography?.staffName||{})}
  };

  const fs = {
    hospital:18,
    department:18,
    ward:16,
    title:15,
    date:13,
    headerAll:11,
    group:12,
    rollNumber:10.5,
    staffName:16,
    dutyCode:12,
    extraValue:10.5,
    nairValue:10.5,
    summaryLabel:10.5,
    summaryCount:11,
    summaryAbbr:8,
    ...(roster.fontSizes||{})
  };

  const fontVars = {
    "--fs-hospital":`${fs.hospital}px`,
    "--fs-department":`${fs.department}px`,
    "--fs-ward":`${fs.ward}px`,
    "--fs-title":`${fs.title}px`,
    "--fs-date":`${fs.date}px`,
    "--fs-header-all":`${fs.headerAll}px`,
    "--fs-group":`${fs.group}px`,
    "--fs-roll":`${fs.rollNumber}px`,
    "--fs-name":`${fs.staffName}px`,
    "--fs-duty":`${fs.dutyCode}px`,
    "--fs-extra":`${fs.extraValue}px`,
    "--fs-nair":`${fs.nairValue}px`,
    "--fs-summary-label":`${fs.summaryLabel}px`,
    "--fs-summary-day":`${fs.headerAll}px`,
    "--fs-summary-count":`${fs.summaryCount}px`,
    "--fs-summary-abbr":`${fs.summaryAbbr}px`
  };

  return (
    <div
      className="paper"
      ref={ref}
      style={{
        fontFamily:fontStack(roster.fontFamily),
        ...fontVars,
        "--tbl-sr":`${roster.tableSizes?.sr||40}px`,
        "--tbl-roll":`${roster.tableSizes?.roll||58}px`,
        "--tbl-name":`${roster.tableSizes?.name||165}px`,
        "--tbl-day":`${roster.tableSizes?.day||49}px`,
        "--tbl-extra":`${roster.tableSizes?.extra||40}px`,
        "--tbl-row":`${roster.tableSizes?.row||29}px`,
        "--tbl-header-row":`${roster.tableSizes?.headerRow||43}px`,
        "--tbl-summary-header-row":`${roster.tableSizes?.summaryHeaderRow||37}px`,
        "--tbl-summary-row":`${roster.tableSizes?.summaryRow||30}px`,
        "--tbl-group-row":`${roster.tableSizes?.groupRow||33}px`
      }}
    >

      <div className="print-header">

        <div className="print-dept">
          {roster.department}
        </div>

        <div className="print-hospital">
          {roster.hospital}
        </div>

        <div className="room-box">
          {roster.ward}
        </div>

        <div className="print-title">
          {roster.title}
        </div>

        <div className="print-date">
          दिनांक :- <u style={{fontFamily:fontStack(pdfTypography.date.fontFamily),fontWeight:pdfTypography.date.fontWeight}}>{formatDate(roster.from)}</u>
          <span>ते</span>
          दिनांक :- <u style={{fontFamily:fontStack(pdfTypography.date.fontFamily),fontWeight:pdfTypography.date.fontWeight}}>{formatDate(roster.to)}</u>
        </div>

      </div>

      <table className="paper-roster">

        <colgroup>
          <col className="col-sr" />
          {!isServantRoster && <col className="col-roll" />}
          <col className="col-name" />
          {labels.map((_,i)=><col className="col-day" key={i} />)}
          {!isServantRoster && <col className="col-extra" />}
          {!isServantRoster && <col className="col-extra" />}
          {!isServantRoster && <col className="col-extra" />}
        </colgroup>

        <thead>
          <tr>

            <th className="p-sr" style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>अ क्र</th>
            {!isServantRoster && <th className="p-roll" style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>रोल नं</th>}
            <th className="p-name" style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>नावे</th>

            {labels.map((d,i)=>
              <th
                key={i}
                className="p-day"
                style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}
              >
                {d.short}
                <small style={{fontFamily:fontStack(pdfTypography.date.fontFamily),fontWeight:pdfTypography.date.fontWeight}}>{d.date}</small>
              </th>
            )}
            {!isServantRoster && <th className="p-extra" style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>नैर</th>}
            <th className="p-extra" style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>जमा</th>
            {!isServantRoster && <th className="p-extra" style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>रुजू</th>}

          </tr>
        </thead>

        <tbody>

          {finalGroups.map(section=>
            <React.Fragment key={section.group}>

              <tr className="group-row">
                <td colSpan={isServantRoster ? 10 : 13}>
                  {section.group}
                </td>
              </tr>

              {section.rows.map((e,i)=>
                <PrintableRow
                  key={e.id}
                  employee={e}
                  index={i}
                  duties={roster.duties}
                  from={roster.from}
                  rosterType={rosterType}
                  pdfTypography={pdfTypography}
                />
              )}

            </React.Fragment>
          )}

        </tbody>

      </table>

      <table className={`paper-summary ${isServantRoster ? "paper-summary-servant" : "paper-summary-regular"}`}>

        <colgroup>
          <col className="col-sr" />
          {!isServantRoster && <col className="col-roll" />}
          <col className="col-name" />
          {labels.map((_,i)=><col className="col-day" key={i} />)}
          {!isServantRoster && <col className="col-extra" />}
          {!isServantRoster && <col className="col-extra" />}
          {!isServantRoster && <col className="col-extra" />}
          {isServantRoster && <col className="col-extra" />}
        </colgroup>

        <thead>
          <tr>
            <th className="summary-duty" colSpan={isServantRoster ? 2 : 3} style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}>
              ड्युटी
            </th>

            {labels.map((d,i)=>
              <th
                key={i}
                className="summary-day"
                style={{fontFamily:fontStack(pdfTypography.header.fontFamily),fontWeight:pdfTypography.header.fontWeight}}
              >
                {d.short}
                <small style={{fontFamily:fontStack(pdfTypography.date.fontFamily),fontWeight:pdfTypography.date.fontWeight}}>{d.date}</small>
              </th>
            )}
            {/* Match the main roster's trailing columns exactly.
                Regular roster: नैर / जमा / रुजू.
                Servant roster: जमा only. */}
            {isServantRoster && <th className="summary-extra summary-extra-blank" aria-hidden="true"></th>}
            {!isServantRoster && <th className="summary-extra summary-extra-blank" aria-hidden="true"></th>}
            {!isServantRoster && <th className="summary-extra summary-extra-blank" aria-hidden="true"></th>}
            {!isServantRoster && <th className="summary-extra summary-extra-blank" aria-hidden="true"></th>}

          </tr>
        </thead>

        <tbody>

          {summaryDuties.map(duty=>
            <tr key={duty.key}>
              <th className="summary-duty summary-label" colSpan={isServantRoster ? 2 : 3} style={{fontFamily:fontStack(pdfTypography.summaryLabel.fontFamily),fontWeight:pdfTypography.summaryLabel.fontWeight}}>
                {duty.label}
                <span className="summary-abbr">({duty.abbr})</span>
              </th>
              {labels.map((_,dayIndex)=>
                <td key={dayIndex} className="summary-count" style={{fontFamily:fontStack(pdfTypography.summaryCount.fontFamily),fontWeight:pdfTypography.summaryCount.fontWeight}}>
                  {SUMMARY_DEFAULT_KEYS.has(duty.key) && duty.key==="leave"
                    ? (dailyLeaveCounts[dayIndex]||"")
                    : (dailyDutyCounts[dayIndex][duty.key]||"")}
                </td>
              )}
              {isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
              {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
              {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
              {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            </tr>
          )}

          <tr>
            <th className="summary-duty summary-label" colSpan={isServantRoster ? 2 : 3} style={{fontFamily:fontStack(pdfTypography.summaryLabel.fontFamily),fontWeight:pdfTypography.summaryLabel.fontWeight}}>
              सुट्टया
            </th>
            {labels.map((_,dayIndex)=><td key={dayIndex} className="summary-count" style={{fontFamily:fontStack(pdfTypography.summaryCount.fontFamily),fontWeight:pdfTypography.summaryCount.fontWeight}}>{dailyHolidayCounts[dayIndex]||""}</td>)}
            {isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
          </tr>

          {customSummaryDuties.map(duty=>
            <tr key={`custom-summary-${duty.key}`}>
              <th className="summary-duty summary-label" colSpan={isServantRoster ? 2 : 3} style={{fontFamily:fontStack(pdfTypography.summaryLabel.fontFamily),fontWeight:pdfTypography.summaryLabel.fontWeight}}>
                {duty.label}
                <span className="summary-abbr">({duty.abbr})</span>
              </th>
              {labels.map((_,dayIndex)=><td key={dayIndex} className="summary-count" style={{fontFamily:fontStack(pdfTypography.summaryCount.fontFamily),fontWeight:pdfTypography.summaryCount.fontWeight}}>{dailyDutyCounts[dayIndex][duty.key]||""}</td>)}
              {isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
              {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
              {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
              {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            </tr>
          )}

          <tr className="grand-total">
            <th className="summary-duty summary-label" colSpan={isServantRoster ? 2 : 3} style={{fontFamily:fontStack(pdfTypography.summaryLabel.fontFamily),fontWeight:pdfTypography.summaryLabel.fontWeight}}>
              एकूण
            </th>

            {labels.map((_,dayIndex)=>
              <td key={dayIndex} className="summary-count" style={{fontFamily:fontStack(pdfTypography.summaryCount.fontFamily),fontWeight:pdfTypography.summaryCount.fontWeight}}>
                {roster.employees.reduce((total,e)=>{
                  if(isSummaryExcludedEmployee(e)) return total;

                  const date=isoDateForDay(roster.from,dayIndex);
                  const onLeave=!!(
                    e.leaveType && e.leaveFrom && e.leaveTo &&
                    date && date>=e.leaveFrom && date<=e.leaveTo
                  );
                  return total + (e.duties[dayIndex] || onLeave ? 1 : 0);
                },0)||""}
              </td>
            )}
            {isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
            {!isServantRoster && <td className="summary-extra summary-extra-blank" aria-hidden="true"></td>}
          </tr>

        </tbody>

      </table>

    </div>
  );
});

function PrintableRow({employee,index,duties,from,rosterType="regular",pdfTypography}) {
  const isServantRoster=rosterType==="servant";
  const hasLeave=!!(employee.leaveType && employee.leaveFrom && employee.leaveTo);
  const leaveDays=hasLeave
    ? Array.from({length:7},(_,i)=>{
        const date=isoDateForDay(from,i);
        return !!(date && date>=employee.leaveFrom && date<=employee.leaveTo);
      })
    : Array(7).fill(false);

  const renderDutyCell=(dayIndex)=>{
    const key=employee.duties[dayIndex];
    const duty=duties.find(d=>d.key===key);
    return (
      <td key={`duty-${dayIndex}`} className="print-duty-code" style={{fontFamily:fontStack(pdfTypography?.dutyCode?.fontFamily||"Tiro Devanagari Marathi"),fontWeight:pdfTypography?.dutyCode?.fontWeight||400}}>
        {duty?.abbr || ""}
        {employee.customNotes?.[dayIndex] ? <small>{employee.customNotes[dayIndex]}</small> : null}
      </td>
    );
  };

  const dayCells=[];
  let i=0;
  while(i<7){
    if(!leaveDays[i]){
      dayCells.push(renderDutyCell(i));
      i++;
      continue;
    }

    const start=i;
    while(i<7 && leaveDays[i]) i++;
    const span=i-start;
    dayCells.push(
      <td
        key={`leave-${start}`}
        colSpan={span}
        className="leave-range-print-span"
      >
        <span className="leave-range-print-text">
          {employee.leaveType==="ML" ? "ON MEDICAL LEAVE" : "ON EL"} FROM {formatDate(employee.leaveFrom)} TO {formatDate(employee.leaveTo)}
        </span>
      </td>
    );
  }

  return (
    <tr>

      <td className="print-sr-cell">{index+1}</td>

      {!isServantRoster && (
        <td
          className="print-roll-cell"
          style={{
            fontFamily:fontStack(pdfTypography?.rollNumber?.fontFamily||"Tiro Devanagari Marathi"),
            fontWeight:pdfTypography?.rollNumber?.fontWeight||400
          }}
        >
          {employee.rollNo}
        </td>
      )}

      <td
        className="print-name"
        style={{
          fontSize:`${employee.marathiFontSize||16}px`,
          fontFamily:fontStack(pdfTypography?.staffName?.fontFamily||"Tiro Devanagari Marathi"),
          fontWeight:pdfTypography?.staffName?.fontWeight ?? (employee.marathiBold?700:400)
        }}
      >
        <div className="print-name-inline">
          <span>{displayStaffName(employee)}</span>
        </div>
      </td>

      {dayCells}

      {!isServantRoster && <td className="print-extra print-nair-value" style={{fontFamily:fontStack(pdfTypography?.extraValue?.fontFamily||"Tiro Devanagari Marathi"),fontWeight:pdfTypography?.extraValue?.fontWeight||400}}>{employee.nair||""}</td>}
      <td className="print-extra" style={{fontFamily:fontStack(pdfTypography?.extraValue?.fontFamily||"Tiro Devanagari Marathi"),fontWeight:pdfTypography?.extraValue?.fontWeight||400}}>{employee.jama||""}</td>
      {!isServantRoster && <td className="print-extra" style={{fontFamily:fontStack(pdfTypography?.extraValue?.fontFamily||"Tiro Devanagari Marathi"),fontWeight:pdfTypography?.extraValue?.fontWeight||400}}>{employee.ruju||""}</td>}

    </tr>
  );
}

createRoot(
  document.getElementById("root")
).render(<AppShell/>);
