'use client';
import {useState,useRef} from 'react';
import {LoaderCircle} from 'lucide-react';
import {useUploadAction} from '@/components/use-upload-action';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/fields';
import {FileRow} from '@/components/file-row';
import {importLeads,type ImportResult} from '@/app/imports/actions';
import type {Staff} from '@/lib/auth';
import type {Branch} from '@/components/staff-management';
import type {LeadRow} from '@/lib/lead-import';
export function BulkLeadImport({branches,members,owner,defaultBranch}:{branches:Branch[];members:Staff[];owner:boolean;defaultBranch?:string}) {
 const [branch,setBranch]=useState(owner?(branches.some(b=>b.id===defaultBranch&&b.is_active)?defaultBranch!:''):branches[0]?.id||'');
 const [mode,setMode]=useState('unassigned');
 const [preview,setPreview]=useState<{rows:LeadRow[];valid:number;invalid:number;duplicate:number;warnings:number}>();
 const [parseError,setParseError]=useState('');const [parsing,setParsing]=useState(false);const generation=useRef(0);
 const [result,action,pending,onSubmit]=useUploadAction<ImportResult>(importLeads,{});
 const callers=members.filter(p=>p.role==='tele_counsellor'&&p.is_active&&p.branch_id===branch);
 async function template(){const {SAMPLE_CSV}=await import('@/lib/lead-import');const url=URL.createObjectURL(new Blob(['\uFEFF'+SAMPLE_CSV],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='career-solution-lead-template.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <details className="panel"><summary className="font-semibold text-navy">Bulk Lead Import · CSV / Excel</summary><div className="mt-5 space-y-5">
  <p className="text-sm text-muted">First worksheet only · Max 4 MB · Up to 5,000 lead rows and 64 columns. Student phones are unique; siblings may share a Parent Phone.</p>
  <Button type="button" variant="outline" onClick={()=>void template()}>Download Sample CSV Template</Button>
  <form action={action} onSubmit={onSubmit} aria-busy={pending||parsing} onReset={event=>event.preventDefault()} className="space-y-5"><fieldset className="contents" disabled={pending}>
   {owner?<Select label="Import into branch" name="branch_id" value={branch} onChange={event=>setBranch(event.target.value)} required><option value="">Select a branch</option>{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</Select>:<><input type="hidden" name="branch_id" value={branch}/><p className="text-sm font-medium">Import into {branches[0]?.name}</p></>}
   <div className="rounded-xl border border-dashed border-[#9CC9C1] bg-[#F4FAF8] p-3.5">
    <FileRow label="Lead spreadsheet" name="file" mode="select" busy={pending} readyText="ready to import"
     accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
     hint="CSV or Excel (.xlsx, .xls) · up to 4 MB. Nothing is imported until you select Import Valid Leads."
     onFile={async file=>{
      const version=++generation.current;setPreview(undefined);setParseError('');if(!file){setParsing(false);return;}setParsing(true);
      try{const {parseLeadFile}=await import('@/lib/lead-import');const parsed=parseLeadFile(new Uint8Array(await file.arrayBuffer()),file.name);if(version===generation.current)setPreview({rows:parsed.rows,valid:parsed.valid.length,invalid:parsed.invalid_count,duplicate:parsed.duplicate_count,warnings:parsed.parent_warning_count});}
      catch(error){if(version===generation.current)setParseError(error instanceof Error?error.message:'Unable to read file.');}finally{if(version===generation.current)setParsing(false);}
     }}/>
   </div>
   <Select label="Tele-counsellor assignment" name="assignment_mode" value={mode} onChange={event=>setMode(event.target.value)}><option value="unassigned">Leave Unassigned</option><option value="round_robin">Round-Robin Auto-Assign</option><option value="one">Assign All to One Tele-Counsellor</option></Select>
   {mode==='one'&&<Select key={branch} label="Assign all leads to" name="one_caller" required><option value="">Select a tele-counsellor</option>{callers.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>}
   {mode==='round_robin'&&<fieldset key={branch} className="space-y-3 rounded-lg border border-line p-4"><legend className="px-2 text-sm font-semibold">Select active tele-counsellors</legend>{callers.length?callers.map(p=><label key={p.id} className="flex gap-2 text-sm"><input type="checkbox" name="caller_ids" value={p.id} defaultChecked/>{p.full_name}</label>):<p className="text-sm text-muted">No active tele-counsellors in this branch. Choose Leave Unassigned or add staff first.</p>}</fieldset>}
  </fieldset>
  {parsing&&<p role="status">Reading spreadsheet…</p>}{parseError&&<p role="alert" className="text-sm text-danger-text">{parseError}</p>}
  {preview&&<div className="space-y-3"><h3 className="font-semibold">Pre-import preview</h3><p className="text-sm">{preview.valid} ready · {preview.duplicate} file duplicates · {preview.invalid} invalid · {preview.warnings} shared-parent warnings</p><p className="text-xs text-muted">Existing student phones and branch parent contacts are checked securely during import.</p><div className="max-h-80 overflow-auto rounded-lg border border-line"><table className="w-full text-left text-sm"><thead className="bg-[#FBF9F4]"><tr>{['Row','Student','Student Phone','Parent Phone','Preview'].map(h=><th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{preview.rows.map(row=><tr key={row.row_number} className="border-t"><td className="p-3">{row.row_number}</td><td className="p-3">{row.full_name||'—'}</td><td className="p-3">{row.student_phone}</td><td className="p-3">{row.parent_phone||'—'}</td><td className="p-3">{row.reason||'Ready'}</td></tr>)}</tbody></table></div></div>}
  {result.error&&<p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger-text">{result.error}</p>}
  <Button type="submit" disabled={pending||parsing||!preview?.valid||!branch||(mode!=='unassigned'&&!callers.length)} aria-busy={pending||parsing}>{(pending||parsing)&&<LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/>}{parsing?'Reading spreadsheet…':pending?'Importing…':'Import Valid Leads'}</Button>
  </form>
  {result.summary&&<section className="space-y-3 rounded-lg bg-teal-soft p-4" aria-label="Import result"><h3 className="font-semibold">Import result</h3><p role="status" className="text-sm">{result.summary.imported_count} imported · {result.summary.duplicate_count} duplicates skipped · {result.summary.invalid_count} invalid skipped · {result.summary.parent_warning_count} shared-parent warnings</p><p className="text-sm">Refresh the student list to view imported leads.</p><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-2">Row</th><th scope="col" className="p-2">Result</th><th scope="col" className="p-2">Reason</th></tr></thead><tbody>{result.summary.rows.map(row=><tr key={row.row_number}><td className="p-2">{row.row_number}</td><td className="p-2">{row.status}</td><td className="p-2">{row.reason}</td></tr>)}</tbody></table></div></section>}
 </div></details>;
}
