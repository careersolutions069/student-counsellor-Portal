export function prepareUploadForm(form:FormData) {
 // React's multipart transport can assign a filename to an unselected empty file input.
 for(const [name,value] of [...form.entries()])if(value instanceof File&&!value.size&&!value.name)form.delete(name);
 return form;
}
