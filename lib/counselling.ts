import { z } from 'zod';
export const INDIAN_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'] as const;
export const CATEGORIES = ['security_deposit','stage_doc_1_3','stage_doc_4_5','stage_doc_6','choice_pdf','allotment_letter','new_choice_pdf','new_allotment_letter','upgrade_choice_pdf','upgraded_allotment_letter'] as const;
export type Category = typeof CATEGORIES[number];
export const preferredStatesSchema = z.array(z.enum(INDIAN_STATES)).max(5,'Select up to 5 states.').refine(states=>new Set(states).size===states.length,'Select each state only once.');
export const slotSchema = z.object({doc_category:z.enum(CATEGORIES),phase_number:z.number().int().min(1).max(6).nullable()}).refine(s=>['choice_pdf','allotment_letter'].includes(s.doc_category)===(s.phase_number!==null),'A phase is required only for phase choice and allotment documents.');
export type CounsellingState = {preferred_states:string[];current_phase:number;allotted_phase:number|null;finished:boolean};
export type CounsellingDocument = {id:string;student_id:string;branch_id:string;doc_category:Category;phase_number:number|null;label:string;file_name:string;file_path:string;show_to_student:boolean;reused_from_doc_id:string|null;created_at:string};
export type SharedCounsellingDocument = Pick<CounsellingDocument,'id'|'label'|'file_name'>;
export type CounsellingWorkspace = {branch_id:string;state:CounsellingState;documents:CounsellingDocument[]};
export function stageCategory(phase:number):Category {return phase<=3?'stage_doc_1_3':phase<=5?'stage_doc_4_5':'stage_doc_6';}
export function documentLabel(category:Category,phase:number|null) {
 const labels:Partial<Record<Category,string>>={security_deposit:'Security Deposit Document',stage_doc_1_3:'Stage Document (Covers Phases 1, 2 & 3)',stage_doc_4_5:'Stage Document (Covers Phases 4 & 5)',stage_doc_6:'Stage Document (Phase 6)',new_choice_pdf:'New Choice PDF',new_allotment_letter:'New Allotment Letter',upgrade_choice_pdf:'Upgrade Choice PDF',upgraded_allotment_letter:'Upgraded Allotment Letter'};
 return labels[category] || `Phase ${phase} ${category==='choice_pdf'?'Choice of Colleges PDF':'Allotment Letter'}`;
}
export function slotUnlocked(category:Category,phase:number|null,state:CounsellingState,documents:Pick<CounsellingDocument,'doc_category'>[]) {
 if(!slotSchema.safeParse({doc_category:category,phase_number:phase}).success)return false;
 if(category==='choice_pdf')return phase!<=state.current_phase;
 if(category==='allotment_letter')return phase===state.allotted_phase;
 if(category==='stage_doc_4_5')return state.current_phase>=4;
 if(category==='stage_doc_6')return state.current_phase>=6;
 if(category==='security_deposit'||category==='stage_doc_1_3')return true;
 if(state.allotted_phase===null&&!documents.some(d=>d.doc_category==='allotment_letter'))return false;
 if(category==='new_allotment_letter')return documents.some(d=>d.doc_category==='new_choice_pdf');
 if(category==='upgraded_allotment_letter')return documents.some(d=>d.doc_category==='upgrade_choice_pdf');
 return true;
}
