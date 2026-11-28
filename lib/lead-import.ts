import * as XLSX from 'xlsx';
import {normalizePhone,phoneSchema} from './validation';
import {MAX_UPLOAD_SIZE,UPLOAD_SIZE_ERROR} from './upload-limits';
export const MAX_IMPORT_ROWS=5000;
export const SAMPLE_CSV='Student Name,Student Phone,Parent Phone,Lead Source,Target Course,Academic Stream,Marks,City,State\r\nSample Student,9876543210,9876543211,School,MBBS,PCB,610,Patna,Bihar\r\n';
const aliases:Record<string,string>={'name':'full_name','student name':'full_name','phone':'student_phone','mobile':'student_phone','student phone':'student_phone','parent phone':'parent_phone','father phone':'parent_phone','source':'lead_source','lead source':'lead_source','course':'target_course','target course':'target_course','stream':'academic_stream','academic stream':'academic_stream','marks':'percentage_or_score','score':'percentage_or_score','city':'city','state':'state'};
export type LeadRow={row_number:number;full_name:string;student_phone:string;parent_phone:string|null;lead_source:string;target_course:string;academic_stream:string;percentage_or_score:string;city:string;state:string;status:'valid'|'invalid'|'duplicate';reason:string};
export type ImportSummary={imported_count:number;duplicate_count:number;invalid_count:number;parent_warning_count:number;held_count?:number;requeued_count?:number;rows:{row_number:number;status:string;reason:string}[]};
// Bound expanded XLSX content before the parser allocates worksheet XML.
function checkArchive(bytes:Uint8Array) {
 if(bytes[0]!==0x50||bytes[1]!==0x4b)return;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Invalid Excel archive.');
 const count=view.getUint16(end+10,true);let cursor=view.getUint32(end+16,true),expanded=0;
 if(count>1000||cursor>=bytes.length)throw Error('Excel workbook is too complex. Export the lead sheet as CSV.');
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)throw Error('Invalid Excel archive.');
  expanded+=view.getUint32(cursor+24,true);
  if(expanded>32*1024*1024)throw Error('Expanded Excel workbook is too large. Export the lead sheet as CSV.');
  cursor+=46+view.getUint16(cursor+28,true)+view.getUint16(cursor+30,true)+view.getUint16(cursor+32,true);
 }
}
export function parseLeadFile(input:Uint8Array|ArrayBuffer,fileName:string) {
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength>MAX_UPLOAD_SIZE)throw Error(UPLOAD_SIZE_ERROR);
 if(!bytes.length)throw Error('Choose a non-empty file.');
 const extension=fileName.toLowerCase().split('.').at(-1);
 if(!['csv','xlsx','xls'].includes(extension||''))throw Error('Choose a CSV or Excel (.xlsx/.xls) file.');
 if(extension==='xlsx'&&(bytes[0]!==0x50||bytes[1]!==0x4b))throw Error('Choose a valid Excel workbook.');
 if(extension==='xls'&&!(bytes[0]===0xd0&&bytes[1]===0xcf)&&!(bytes[0]===0x50&&bytes[1]===0x4b))throw Error('Choose a valid Excel workbook.');
 checkArchive(bytes);
 const book=XLSX.read(bytes,{type:'array',raw:true,dense:true,sheets:0,sheetRows:MAX_IMPORT_ROWS+2,cellFormula:false,cellHTML:false,cellStyles:false,cellNF:false});
 const sheet=book.Sheets[book.SheetNames[0]];
 if(!sheet||!sheet['!ref'])throw Error('No lead rows found.');
 const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
 if(range.e.r>MAX_IMPORT_ROWS||range.e.c>=64)throw Error(`Use up to ${MAX_IMPORT_ROWS} lead rows and 64 columns per file. Split this file and retry.`);
 const values=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true});
 const header=values[0]||[],used=new Set<string>();
 const columns=header.map(value=>{const key=aliases[String(value).replace(/^\uFEFF/,'').toLowerCase().trim().replace(/[_\s]+/g,' ')];if(key&&used.has(key))throw Error(`Ambiguous duplicate column: ${value}`);if(key)used.add(key);return key;});
 if(!used.has('full_name')||!used.has('student_phone'))throw Error('Include Student Name and Student Phone columns.');
 const rows:LeadRow[]=[],seen=new Set<string>(),parents=new Set<string>();let parent_warning_count=0;
 values.slice(1).forEach((values,index)=>{
  if(values.every(value=>String(value??'').trim()===''))return;
  const fields:Record<string,string>={};columns.forEach((key,col)=>{if(key)fields[key]=String(values[col]??'').trim();});
  const row:LeadRow={row_number:index+2,full_name:'',student_phone:'',parent_phone:null,lead_source:'',target_course:'',academic_stream:'',percentage_or_score:'',city:'',state:'',...fields,status:'valid',reason:''};
  row.student_phone=normalizePhone(row.student_phone);row.parent_phone=row.parent_phone?normalizePhone(row.parent_phone):null;
  if(!row.full_name||row.full_name.length>150)row.reason='Student Name is required (max 150 characters).';
  else if(!phoneSchema.safeParse(fields.student_phone||'').success)row.reason='Enter a valid 10-digit Student Phone.';
  else if(fields.parent_phone&&!phoneSchema.safeParse(fields.parent_phone).success)row.reason='Enter a valid 10-digit Parent Phone or leave it blank.';
  else if(Object.values(fields).some(value=>value.length>500))row.reason='Keep each field to 500 characters or fewer.';
  if(row.reason)row.status='invalid';
  else if(seen.has(row.student_phone)){row.status='duplicate';row.reason='Duplicate Student Phone within file.';}
  else {seen.add(row.student_phone);if(row.parent_phone){if(parents.has(row.parent_phone))parent_warning_count++;parents.add(row.parent_phone);}}
  rows.push(row);
 });
 if(!rows.length)throw Error('No lead rows found.');
 return {rows,valid:rows.filter(row=>row.status==='valid'),invalid_count:rows.filter(row=>row.status==='invalid').length,duplicate_count:rows.filter(row=>row.status==='duplicate').length,parent_warning_count};
}
