const $ = (id) => document.getElementById(id);
const fields = ['guideTitle','projectName','subtitle','sectionNumber','sectionTitle','mainNote','facts','imageCaption'];
const state = {images:[], updates:[], reviews:[], sections:[], layout:{}, unlinked:{}, settings:{autoSync:false,syncMinutes:2,includeNotesPage:false,includeProgressPage:false,freeLayout:false}};
const subjectNames=['Software Engineering','Operating System','Advanced Computer'];
let subjectLibrary={},activeSubject='Operating System',activeLesson='Unit 1';
let editMode=false;
const clone=value=>JSON.parse(JSON.stringify(value));
function captureDraft(){return {fields:Object.fromEntries(fields.map(k=>[k,$(k).value])),state:clone(state)}}
function blankDraft(subject,lesson){return {fields:{guideTitle:'My Daily Notes Guide',projectName:`${subject} — ${lesson}`,subtitle:'Write and organise your lesson notes.',sectionNumber:'1.1',sectionTitle:'New lesson topic',mainNote:'Start writing your notes here.',facts:'',imageCaption:'Reference image'},state:{images:[],updates:[],reviews:[],sections:[],layout:{},unlinked:{},settings:clone(state.settings)}}}
function keepActiveDraft(){subjectLibrary[activeSubject]??={};subjectLibrary[activeSubject][activeLesson]=captureDraft()}
function renderSubjectWorkspace(){const tabs=$('subjectTabs'),select=$('lessonSelect');$('activeSubjectLabel').textContent=activeSubject;tabs.innerHTML=subjectNames.map(name=>`<button type="button" data-subject="${escapeHtml(name)}" class="${name===activeSubject?'active':''}">${escapeHtml(name)}</button>`).join('');select.innerHTML='';Object.keys(subjectLibrary[activeSubject]||{}).forEach(lesson=>{const option=document.createElement('option');option.value=lesson;option.textContent=lesson;option.selected=lesson===activeLesson;select.append(option)});tabs.querySelectorAll('button').forEach(button=>button.onclick=()=>switchDraft(button.dataset.subject,Object.keys(subjectLibrary[button.dataset.subject]||{})[0]||'Unit 1'))}
function switchDraft(subject,lesson,skipCapture=false){if(!skipCapture)keepActiveDraft();activeSubject=subject;activeLesson=lesson;subjectLibrary[subject]??={};subjectLibrary[subject][lesson]??=blankDraft(subject,lesson);const draft=subjectLibrary[subject][lesson];fields.forEach(k=>$(k).value=draft.fields?.[k]??'');Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,clone(draft.state));renderSubjectWorkspace();renderEditors();render();save()}
function renderLibraryCards(){const cards=$('libraryCards');if(!cards)return;cards.innerHTML=subjectNames.map(subject=>{const lessons=Object.keys(subjectLibrary[subject]||{});return `<button class="library-card" type="button" data-library-subject="${escapeHtml(subject)}"><p class="eyebrow">${lessons.length} LESSON${lessons.length===1?'':'S'} AVAILABLE</p><h2>${escapeHtml(subject)}</h2><p>Open your notes in a focused reading view, then edit any lesson when needed.</p><span>Open notes →</span></button>`}).join('');cards.querySelectorAll('[data-library-subject]').forEach(button=>button.onclick=()=>{const subject=button.dataset.librarySubject;switchDraft(subject,Object.keys(subjectLibrary[subject]||{})[0]||'Unit 1');openReader()})}
function openDashboard(){keepActiveDraft();save();editMode=false;document.body.classList.remove('reader-mode');$('libraryDashboard').hidden=false;document.querySelector('.app-shell').hidden=true;renderLibraryCards();$('editModeBtn').textContent='Edit lesson'}
function openReader(){document.body.classList.add('reader-mode');$('libraryDashboard').hidden=true;document.querySelector('.app-shell').hidden=false;$('readerLocation').textContent=` ${activeSubject} · ${activeLesson}`;render()}
function setEditMode(enabled){editMode=enabled;document.body.classList.toggle('reader-mode',!enabled);$('editModeBtn').textContent=enabled?'Reading mode':'Edit lesson';$('readerLocation').textContent=` ${activeSubject} · ${activeLesson}${enabled?' · Editing':''}`;render()}
const today = () => new Date().toISOString().slice(0,10);
let driveTimer;
let cloudTimer;
let pageLayoutHistory=[];
let lastEditable=null,lastEditableRange=null,awaitingPageBreak=false;
let freeResizeObserver,resizeSaveTimer;
let selectedComponentKey=null;
function selectComponent(key){
  selectedComponentKey=key;
  const toolbar=$('componentToolbar');
  if(!toolbar)return;
  toolbar.hidden=false;
  $('componentToolbarText').textContent=key.startsWith('image-')?'Image selected — resize from any blue corner':'Component selected';
}
function deleteSelectedComponent(){
  const key=selectedComponentKey;
  if(!key)return;
  const image=key.match(/^image-(\d+)$/), section=key.match(/^section-(\d+)$/), item=key.match(/^item-(\d+)-(number|heading|notes)$/);
  if(image)state.images.splice(Number(image[1]),1);
  else if(section)state.sections.splice(Number(section[1]),1);
  else if(item){const s=state.sections[Number(item[1])];if(s){if(item[2]==='number')s.showNumber=false;else if(item[2]==='heading')s.showHeading=false;else s.notes=''}}
  else if(key==='item-previewMainNote')$('mainNote').value='';
  else if(key==='item-previewNumber')$('sectionNumber').value='';
  else if(key==='item-previewSectionTitle')$('sectionTitle').value='';
  else if(key==='item-previewFacts')$('facts').value='';
  else if(key==='main-section'){$('sectionNumber').value='';$('sectionTitle').value='';$('mainNote').value='';}
  else return;
  delete state.layout[key];selectedComponentKey=null;$('componentToolbar').hidden=true;
  renderEditors();render();scheduleDriveSync();
}
function unlinkSelectedGroup(){
  if(!selectedComponentKey)return;
  let group=selectedComponentKey;
  const child=group.match(/^item-(\d+)-(number|heading|notes)$/);
  if(child)group=`section-${child[1]}`;
  else if(group.startsWith('item-preview'))group='main-section';
  if(!['main-section'].includes(group)&&!/^section-\d+$/.test(group))return;
  state.unlinked=state.unlinked||{};state.unlinked[group]=true;
  selectedComponentKey=null;$('componentToolbar').hidden=true;render();scheduleDriveSync();
}
function moveSelectedComponent(direction,amount=12){
  if(!selectedComponentKey)return;
  const el=document.querySelector(`[data-drag-key="${selectedComponentKey}"]`);if(!el)return;
  const pos=state.layout[selectedComponentKey]||{x:0,y:0};let x=pos.x||0,y=pos.y||0;
  if(direction==='left')x-=amount;if(direction==='right')x+=amount;if(direction==='up')y-=amount;if(direction==='down')y+=amount;
  state.layout[selectedComponentKey]={...pos,x,y};el.style.transform=`translate(${x}px, ${y}px)`;save();scheduleDriveSync();
}
function panFreeWorkspace(direction){
  const viewport=document.querySelector('.preview-wrap');if(!viewport)return;
  const distance=Math.max(260,Math.round(viewport.clientWidth*.7));
  viewport.scrollBy({left:direction==='left'?-distance:distance,behavior:'smooth'});
}
function syncWorkspaceScrollbar(){
  const viewport=document.querySelector('.preview-wrap'),bar=$('workspaceScroll'),track=$('workspaceScrollTrack'),area=$('printArea');if(!viewport||!bar||!track||!area)return;
  const enabled=Boolean(state.settings.freeLayout);bar.hidden=!enabled;if(!enabled)return;
  track.style.width=`${Math.max(area.scrollWidth,viewport.clientWidth+1)}px`;bar.scrollLeft=viewport.scrollLeft;
}
function rememberPageLayout(){pageLayoutHistory.push({mainNote:$('mainNote').value,sections:JSON.parse(JSON.stringify(state.sections))});if(pageLayoutHistory.length>20)pageLayoutHistory.shift()}
function undoPageLayout(){const previous=pageLayoutHistory.pop();if(!previous){alert('There is no page action to undo.');return}$('mainNote').value=previous.mainNote;state.sections=previous.sections;renderEditors();render();scheduleDriveSync()}

function escapeHtml(text=''){const d=document.createElement('div');d.textContent=text;return d.innerHTML}
function formatText(text=''){const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);let html='',bullets=[];const flush=()=>{if(bullets.length){html+=`<ul>${bullets.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`;bullets=[]}};lines.forEach(line=>{if(line==='[[PAGE_BREAK]]'){flush();html+='<div class="manual-break" data-html2canvas-ignore="true">PAGE BREAK</div>'}else if(/^(?:[-*•]|\d+[.)])\s+/.test(line)){bullets.push(line.replace(/^(?:[-*•]|\d+[.)])\s+/,''))}else{flush();html+=`<p>${escapeHtml(line)}</p>`}});flush();return html||'<p>Start writing your note in the editor.</p>'}
function formatDate(value){if(!value)return 'No date';return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T00:00:00`))}
function setDriveStatus(message, stateName='') { const el=$('driveStatus'); if(el){el.textContent=message;el.dataset.state=stateName;} }
function setCloudStatus(message,stateName=''){const el=$('cloudStatus'),top=$('cloudTopStatus');if(el){el.textContent=message;el.dataset.state=stateName}if(top){top.textContent=message;top.dataset.state=stateName}}
function authHeaders(extra={}){const token=sessionStorage.getItem('samarth-vault-token');return token?{...extra,Authorization:`Bearer ${token}`} : extra}
function queueCloudBackup(){if(!window.TIDB_API_URL||!sessionStorage.getItem('samarth-vault-token'))return;clearTimeout(cloudTimer);setCloudStatus('Cloud save pending');cloudTimer=setTimeout(saveToTiDB,1500)}
async function saveToTiDB(){try{keepActiveDraft();const response=await fetch(`${window.TIDB_API_URL}/api/drafts/samarthp2727`,{method:'PUT',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({library:subjectLibrary,activeSubject,activeLesson})});if(!response.ok)throw new Error('Cloud save failed');setCloudStatus('Saved permanently','saved')}catch(error){console.warn('TiDB backup unavailable',error);setCloudStatus('Browser backup only','error')}}
async function restoreFromTiDB(){if(!window.TIDB_API_URL||!sessionStorage.getItem('samarth-vault-token'))return;try{const response=await fetch(`${window.TIDB_API_URL}/api/drafts/samarthp2727`,{headers:authHeaders()});if(response.status===404){setCloudStatus('No cloud notes yet');return}if(!response.ok)throw new Error('Cloud restore failed');const remote=(await response.json()).draft;if(!remote?.library)return;subjectLibrary=remote.library;activeSubject=remote.activeSubject||'Operating System';activeLesson=remote.activeLesson||'Unit 1';switchDraft(activeSubject,activeLesson,true);setCloudStatus('Cloud notes loaded','saved')}catch(error){console.warn('TiDB restore unavailable',error);setCloudStatus('Browser backup only','error')}}
async function createPdfBase64(){
  if(!window.html2canvas || !window.jspdf) throw new Error('PDF tools did not load. Check your internet connection.');
  const PDF_WIDTH=176, PDF_HEIGHT=250, PDF_RENDER_SCALE=3; // B5 at near-300 DPI for clear Drive PDFs
  const { jsPDF } = window.jspdf, pdf = new jsPDF({orientation:'p',unit:'mm',format:[PDF_WIDTH,PDF_HEIGHT],compress:true});
  const pages = [...document.querySelectorAll('#printArea .page:not([hidden])')]; let added=false;
  for(const page of pages){const pageRect=page.getBoundingClientRect();const canvas=await html2canvas(page,{scale:PDF_RENDER_SCALE,useCORS:true,backgroundColor:'#fffdfa'});const scale=canvas.width/pageRect.width,sliceHeight=Math.round(canvas.width*PDF_HEIGHT/PDF_WIDTH);const starts=[...page.querySelectorAll('.intro-block,.section-block')].map(el=>Math.round((el.getBoundingClientRect().top-pageRect.top)*scale)).filter(y=>y>0).sort((a,b)=>a-b),forced=[...page.querySelectorAll('.manual-break')].map(el=>Math.round((el.getBoundingClientRect().top-pageRect.top)*scale)).filter(y=>y>0).sort((a,b)=>a-b);let y=0;while(y<canvas.height){let end=Math.min(y+sliceHeight,canvas.height);const forcedBreak=forced.find(point=>point>y+Math.round(8*scale)&&point<=end);if(forcedBreak)end=forcedBreak;else{const safeStarts=starts.filter(start=>start>y+Math.round(18*scale)&&start<end);if(safeStarts.length){const candidate=safeStarts[safeStarts.length-1];if(candidate-y>sliceHeight*.42)end=candidate}}const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=end-y;slice.getContext('2d').drawImage(canvas,0,y,canvas.width,end-y,0,0,canvas.width,end-y);if(added)pdf.addPage();pdf.addImage(slice.toDataURL('image/jpeg',.98),'JPEG',0,0,PDF_WIDTH,slice.height*PDF_WIDTH/canvas.width);added=true;y=end}}
  // Use the binary Blob output, then encode its bytes. This avoids a corrupted
  // Drive upload caused by treating a PDF data URI as text.
  const blob=pdf.output('blob');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not encode the PDF.'));reader.onload=()=>{const result=String(reader.result||'');const base64=result.split(',')[1];if(!base64||!base64.startsWith('JVBER'))return reject(new Error('The generated file is not a valid PDF.'));resolve(base64)};reader.readAsDataURL(blob)});
}
function scheduleDriveSync(){save();}
async function syncToDrive(){try{setDriveStatus('Saving PDF to Drive...','pending');const pdfBase64=await createPdfBase64();const body=new URLSearchParams({payload:JSON.stringify({pdfBase64,fileName:`${$('projectName').value||'My Daily Notes Guide'}.pdf`})});await fetch(window.DRIVE_SYNC_URL,{method:'POST',mode:'no-cors',body});setDriveStatus('Saved to Google Drive','saved')}catch(error){console.error(error);setDriveStatus('Drive save failed','error')}}
function render(){
  $('previewGuideTitle').textContent=$('guideTitle').value||'My Daily Notes Guide';
  ['previewProjectName','runningProjectName','runningProjectName2'].forEach(id=>$(id).textContent=$('projectName').value||'Untitled project');
  $('previewSubtitle').textContent=$('subtitle').value;
  $('previewNumber').textContent=($('sectionNumber').value||'01').padStart(2,'0');
  $('previewSectionTitle').textContent=$('sectionTitle').value||'Today’s focus';
  $('previewMainNote').innerHTML=formatText($('mainNote').value);
  $('previewFacts').innerHTML=$('facts').value.split('\n').filter(Boolean).map(f=>`<li>${escapeHtml(f)}</li>`).join('');
  const cap=escapeHtml($('imageCaption').value||'Reference image');
  $('previewImages').innerHTML=state.images.map((src,i)=>`<figure class="image-card" data-drag-key="image-${i}"><span class="drag-handle" data-html2canvas-ignore="true">⠿ drag</span><img src="${src}" alt="Added reference"/><figcaption>${cap}</figcaption></figure>`).join('');
  $('previewUpdates').innerHTML=state.updates.length?state.updates.map(u=>`<article class="update"><div class="update-date">${formatDate(u.date)}</div><div class="update-text">${escapeHtml(u.text||'No notes added yet.')}</div></article>`).join(''):'<p class="empty">Add your first dated update from the editor.</p>';
  $('previewReviews').innerHTML=state.reviews.length?state.reviews.map(r=>`<div class="review-item">${escapeHtml(r)}</div>`).join(''):'<p class="empty">Add review points to turn this into a checklist.</p>';
  $('notesPage').hidden=!state.settings.includeNotesPage;
  $('updatesPage').hidden=!state.settings.includeProgressPage;
  // Any number of same-page sections may be added. A selected "next page"
  // section starts a fresh group; the PDF manager adds further pages only as needed.
  const inline=[],groups=[];let currentGroup=null;(state.sections||[]).forEach(s=>{if(s.newPage!==false){currentGroup=[s];groups.push(currentGroup)}else if(currentGroup){currentGroup.push(s)}else{inline.push(s)}});
  const sectionMarkup=(s,index,compact=false)=>`<section class="section-block ${compact?'compact-section':''}" ${state.unlinked?.[`section-${index}`]?'':`data-drag-key="section-${index}"`}><span class="drag-handle" data-html2canvas-ignore="true">⠿ drag</span><button class="page-break-tool" data-html2canvas-ignore="true" data-page-break-index="${index}" type="button">↳ Full section to next page</button>${s.showNumber!==false?`<div class="section-index" contenteditable="true" data-section-index="${index}" data-section-field="number">${escapeHtml(s.number||'1.1')}</div>`:''}${s.showHeading!==false?`<h3 contenteditable="true" data-section-index="${index}" data-section-field="heading">${escapeHtml(s.heading||'New section')}</h3>`:''}<div class="main-note" contenteditable="true" data-section-index="${index}" data-section-field="notes">${formatText(s.notes)}</div></section>`;
  $('inlineSections').innerHTML=inline.map(s=>sectionMarkup(s,state.sections.indexOf(s),true)).join('');
  $('extraSections').innerHTML=groups.map((group,pageIndex)=>`<article class="page extra-section-page"><div class="running-header"><span>${escapeHtml($('projectName').value||'Untitled project')}</span><span>My Daily Notes Guide</span><span>Page ${pageIndex+2}</span></div>${group.map(s=>sectionMarkup(s,state.sections.indexOf(s))).join('')}</article>`).join('');
  document.querySelectorAll('#printArea .page').forEach(page=>page.classList.toggle('free-layout',Boolean(state.settings.freeLayout)));
  if(state.settings.freeLayout){document.querySelectorAll('#printArea [contenteditable="true"],#previewFacts,#previewImages .image-card').forEach((el,i)=>{if(!el.dataset.dragKey){const suffix=el.id||`${el.dataset.sectionIndex||'text'}-${el.dataset.sectionField||i}`;el.dataset.dragKey=`item-${suffix}`}if(!el.previousElementSibling?.classList.contains('drag-handle')){const handle=document.createElement('span');handle.className='drag-handle dynamic-handle';handle.dataset.html2canvasIgnore='true';handle.textContent='⠿ drag';el.before(handle)}if(!el.querySelector('.resize-handle'))['nw','ne','sw','se'].forEach(corner=>{const handle=document.createElement('span');handle.className=`resize-handle ${corner}`;handle.dataset.html2canvasIgnore='true';handle.dataset.corner=corner;el.append(handle)})})}
  document.querySelectorAll('[data-drag-key]').forEach(el=>{const pos=state.layout?.[el.dataset.dragKey];if(pos){el.style.transform=`translate(${pos.x||0}px, ${pos.y||0}px)`;if(pos.width)el.style.width=`${pos.width}px`;if(pos.height)el.style.height=`${pos.height}px`;if(pos.scale)el.style.setProperty('--text-scale',pos.scale)}});
  if(state.settings.freeLayout&&window.ResizeObserver){if(!freeResizeObserver){freeResizeObserver=new ResizeObserver(entries=>{for(const entry of entries){const el=entry.target,key=el.dataset.dragKey,rect=entry.contentRect;if(!key||!rect.width)continue;if(!el.dataset.baseWidth){el.dataset.baseWidth=String(rect.width);el.dataset.baseHeight=String(rect.height)}const scale=Math.max(.65,Math.min(1.8,rect.width/Number(el.dataset.baseWidth)));el.style.setProperty('--text-scale',scale);state.layout[key]={...(state.layout[key]||{}),width:Math.round(rect.width),height:Math.round(rect.height),scale};clearTimeout(resizeSaveTimer);resizeSaveTimer=setTimeout(()=>{save();scheduleDriveSync()},700)}})}document.querySelectorAll('#printArea [data-drag-key]').forEach(el=>freeResizeObserver.observe(el))}
  requestAnimationFrame(syncWorkspaceScrollbar);
  document.querySelectorAll('#printArea [contenteditable]').forEach(el=>el.contentEditable=editMode?'true':'false');
}
function addUpdate(data={date:today(),text:''}){state.updates.push(data);renderEditors();render();scheduleDriveSync()}
function addReview(text=''){state.reviews.push(text);renderEditors();render();scheduleDriveSync()}
function renderEditors(){
  $('updatesEditor').innerHTML='';state.updates.forEach((u,i)=>{const n=$('updateTemplate').content.cloneNode(true);const card=n.querySelector('.entry-card');const [date,text]=[n.querySelector('.update-date'),n.querySelector('.update-text')];date.value=u.date;text.value=u.text;date.oninput=e=>{u.date=e.target.value;render()};text.oninput=e=>{u.text=e.target.value;render()};n.querySelector('.remove').onclick=()=>{state.updates.splice(i,1);renderEditors();render()};$('updatesEditor').append(n)});
  $('reviewsEditor').innerHTML='';state.reviews.forEach((r,i)=>{const n=$('reviewTemplate').content.cloneNode(true), input=n.querySelector('input');input.value=r;input.oninput=e=>{state.reviews[i]=e.target.value;render()};n.querySelector('.remove').onclick=()=>{state.reviews.splice(i,1);renderEditors();render()};$('reviewsEditor').append(n)});
  $('sectionsEditor').innerHTML='';(state.sections||[]).forEach((s,i)=>{const n=$('sectionTemplate').content.cloneNode(true),card=n.querySelector('.entry-card');card.draggable=true;card.dataset.index=i;const num=n.querySelector('.extra-number'),heading=n.querySelector('.extra-heading'),notes=n.querySelector('.extra-notes'),placement=n.querySelector('.extra-placement'),showNumber=n.querySelector('.show-number'),showHeading=n.querySelector('.show-heading');num.value=s.number;heading.value=s.heading;notes.value=s.notes;showNumber.checked=s.showNumber!==false;showHeading.checked=s.showHeading!==false;placement.value=s.newPage===false?'same':'next';num.oninput=e=>{s.number=e.target.value;render()};heading.oninput=e=>{s.heading=e.target.value;render()};notes.oninput=e=>{s.notes=e.target.value;render()};showNumber.onchange=e=>{s.showNumber=e.target.checked;render();scheduleDriveSync()};showHeading.onchange=e=>{s.showHeading=e.target.checked;render();scheduleDriveSync()};placement.onchange=e=>{s.newPage=e.target.value==='next';render();scheduleDriveSync()};card.ondragstart=e=>e.dataTransfer.setData('text/plain',String(i));card.ondragover=e=>e.preventDefault();card.ondrop=e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));if(from===i)return;const moved=state.sections.splice(from,1)[0];state.sections.splice(i,0,moved);renderEditors();render();scheduleDriveSync()};n.querySelector('.remove').onclick=()=>{state.sections.splice(i,1);renderEditors();render();scheduleDriveSync()};$('sectionsEditor').append(n)});
}
function save(){keepActiveDraft();localStorage.setItem('daily-notes-pdf-studio',JSON.stringify({library:subjectLibrary,activeSubject,activeLesson}));queueCloudBackup();}
function load(){let saved;try{saved=JSON.parse(localStorage.getItem('daily-notes-pdf-studio'))}catch{}if(saved?.library){subjectLibrary=saved.library;activeSubject=saved.activeSubject||activeSubject;activeLesson=saved.activeLesson||activeLesson;switchDraft(activeSubject,activeLesson,true);return}try{const legacy=JSON.parse(localStorage.getItem('daily-notes-pdf-studio'));if(legacy?.fields){fields.forEach(k=>{if(legacy.fields[k]!==undefined)$(k).value=legacy.fields[k]});Object.assign(state,legacy.state||{})}}catch{}if(!state.updates.length)state.updates=[{date:today(),text:'Started this guide and recorded the first learning goal.'}];if(!state.reviews.length)state.reviews=['Review the main idea and add one example.'];subjectNames.forEach(subject=>subjectLibrary[subject]={});subjectLibrary['Operating System']['Unit 1']=captureDraft();subjectNames.filter(subject=>subject!=='Operating System').forEach(subject=>subjectLibrary[subject]['Unit 1']=blankDraft(subject,'Unit 1'));renderSubjectWorkspace();renderEditors();render();save()}
fields.forEach(k=>$(k).addEventListener('input',()=>{render();scheduleDriveSync()}));
$('addUpdateBtn').onclick=()=>addUpdate(); $('addReviewBtn').onclick=()=>addReview();
$('lessonSelect').onchange=e=>switchDraft(activeSubject,e.target.value);
$('addLessonBtn').onclick=()=>{const lesson=prompt('Lesson name (example: Unit 2)');if(!lesson?.trim())return;keepActiveDraft();const name=lesson.trim();subjectLibrary[activeSubject][name]??=blankDraft(activeSubject,name);switchDraft(activeSubject,name)};
function addSection(newPage){state.sections.push({number:`${state.sections.length+2}.1`,heading:'New section heading',notes:'',newPage});renderEditors();render();scheduleDriveSync()}
function loadChapterOneNotes(){
  $('guideTitle').value='Chapter 1 Notes';$('projectName').value='Operating System Services and Components';$('subtitle').value='Compact textbook notes for Diploma Computer Engineering.';
  $('sectionNumber').value='1.1';$('sectionTitle').value='Introduction to Operating System';
  $('mainNote').value='An operating system is system software that manages computer hardware and software. It provides resources and services to user programs and acts as an interface between the user and the computer hardware.\n\n- It manages CPU, memory, files and input/output devices.\n- It controls the execution of application programs.\n- It is also called a resource manager.';
  $('facts').value='';
  state.sections=[
    {number:'1.1.1',heading:'Need of Operating System',notes:'Operating systems identify input from devices such as keyboards and mice, send output to monitors and printers, and keep track of files and directories.\n\n- The CPU is allocated to user programs for execution.\n- Memory is allocated to programs as needed.\n- The operating system manages peripheral devices such as printers, scanners and secondary storage.',newPage:false},
    {number:'1.1.2',heading:'Components of Operating System',notes:'The main components are process management, main-memory management, file management, input/output management, secondary-storage management, security and the command interpreter.\n\n- Process management creates, schedules and terminates processes.\n- Memory management keeps track of memory and allocates it to programs.\n- File management organizes files, folders and access permissions.',newPage:false},
    {number:'1.1.3',heading:'Operations of Operating System',notes:'Modern operating systems are interrupt driven. The system waits when there is no work, and an interrupt or trap signals an event that needs service.\n\n- A trap is an abnormal condition detected during program execution.\n- The interrupt handler services the interrupt and returns control to the earlier program.\n- The interrupt vector or table stores addresses of service routines.',newPage:true},
    {number:'1.1.3(A)',heading:'Dual Mode Operation',notes:'An operating system uses kernel mode and user mode to protect the computer system.\n\n- In kernel mode, all instructions and system resources are available.\n- In user mode, memory and register access are restricted.\n- System calls provide the controlled switch from user mode to kernel mode.',newPage:false}
  ];
  renderEditors();render();scheduleDriveSync();
}
$('addSectionBtn').onclick=()=>addSection(true);
$('addSamePageSectionBtn').onclick=()=>addSection(false);
$('addNewPageSectionBtn').onclick=()=>addSection(true);
$('packSectionsBtn').onclick=()=>{state.sections.forEach(s=>s.newPage=false);renderEditors();render();scheduleDriveSync()};
function applyPageBreakAtCursor(){const active=lastEditable,range=lastEditableRange?.cloneRange();if(!active||!range){alert('Click inside a note to choose a break point.');return}if(active.id!=='previewMainNote'&&active.dataset.sectionField!=='notes'){alert('Click inside the note text, not the heading.');return}const beforeRange=range.cloneRange();beforeRange.selectNodeContents(active);beforeRange.setEnd(range.endContainer,range.endOffset);const allText=active.innerText,offset=Math.min(beforeRange.toString().length,allText.length),before=allText.slice(0,offset).trimEnd(),after=allText.slice(offset).trimStart();if(!after){alert('Place the cursor before the text that should move to the next page.');return}rememberPageLayout();if(active.id==='previewMainNote'){$('mainNote').value=before;state.sections.unshift({number:$('sectionNumber').value,heading:`${$('sectionTitle').value} (continued)`,notes:after,newPage:true})}else{const index=Number(active.dataset.sectionIndex),section=state.sections[index];section.notes=before;state.sections.splice(index+1,0,{...section,heading:`${section.heading} (continued)`,notes:after,newPage:true})}awaitingPageBreak=false;$('breakHint').hidden=true;document.querySelector('#printArea').classList.remove('break-targeting');renderEditors();render();scheduleDriveSync()}
$('insertPageBreakBtn').onclick=()=>{awaitingPageBreak=true;$('breakHint').hidden=false;document.querySelector('#printArea').classList.add('break-targeting')};
$('moveCurrentSectionBtn').onclick=()=>{const sectionIndex=lastEditable?.dataset?.sectionIndex;if(sectionIndex===undefined){alert('Click inside an added section first.');return}rememberPageLayout();state.sections[Number(sectionIndex)].newPage=true;renderEditors();render();scheduleDriveSync()};
$('undoPageActionBtn').onclick=undoPageLayout;
$('includeNotesPage').onchange=e=>{state.settings.includeNotesPage=e.target.checked;render();scheduleDriveSync()};
$('includeProgressPage').onchange=e=>{state.settings.includeProgressPage=e.target.checked;render();scheduleDriveSync()};
$('freeLayout').onchange=e=>{state.settings.freeLayout=e.target.checked;render();if(e.target.checked)setTimeout(()=>document.querySelector('.preview-wrap').scrollLeft=360,0);scheduleDriveSync()};
$('deleteComponentBtn').onclick=deleteSelectedComponent;
$('unlinkComponentBtn').onclick=unlinkSelectedGroup;
document.querySelectorAll('.move-component').forEach(button=>button.onclick=()=>{const direction=button.dataset.move;if(direction==='left'||direction==='right')panFreeWorkspace(direction);else moveSelectedComponent(direction)});
$('saveBtn').onclick=()=>{save();scheduleDriveSync();$('saveBtn').textContent='Saved';setTimeout(()=>$('saveBtn').textContent='Save draft',1200)};
$('exportBtn').onclick=()=>{save();window.print()};
$('imageInput').onchange=e=>{[...e.target.files].forEach(file=>{const reader=new FileReader();reader.onload=()=>{state.images.push(reader.result);$('imageList').textContent=`${state.images.length} image(s) ready for the PDF`;render();scheduleDriveSync()};reader.readAsDataURL(file)});e.target.value=''};
load();
restoreFromTiDB();
$('includeNotesPage').checked=Boolean(state.settings?.includeNotesPage);$('includeProgressPage').checked=Boolean(state.settings?.includeProgressPage);
$('freeLayout').checked=Boolean(state.settings?.freeLayout);
if(state.settings?.freeLayout)setTimeout(()=>document.querySelector('.preview-wrap').scrollLeft=360,0);
$('themeBtn').onclick=()=>{const dark=!document.body.classList.contains('dark-mode');document.body.classList.toggle('dark-mode',dark);localStorage.setItem('samarth-vault-theme',dark?'dark':'light');$('themeBtn').textContent=dark?'Light mode':'Dark mode'};
if(localStorage.getItem('samarth-vault-theme')==='dark'){$('themeBtn').click()}
$('homeBtn').onclick=openDashboard;
$('editModeBtn').onclick=()=>setEditMode(!editMode);
async function unlockVault(){try{const response=await fetch(`${window.TIDB_API_URL}/api/auth/unlock`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('vaultPassword').value})});const result=await response.json();if(!response.ok||!result.token)throw new Error('Incorrect password');sessionStorage.setItem('samarth-vault-unlocked','yes');sessionStorage.setItem('samarth-vault-token',result.token);$('lockScreen').hidden=true;openDashboard();restoreFromTiDB()}catch{$('lockError').hidden=false}}
$('unlockVaultBtn').onclick=unlockVault;
$('vaultPassword').addEventListener('keydown',e=>{if(e.key==='Enter')unlockVault()});
if(sessionStorage.getItem('samarth-vault-unlocked')==='yes'){$('lockScreen').hidden=true;openDashboard()}else document.querySelector('.app-shell').hidden=true;
document.querySelector('.preview-wrap').addEventListener('scroll',()=>{const bar=$('workspaceScroll');if(bar&&bar.scrollLeft!==document.querySelector('.preview-wrap').scrollLeft)bar.scrollLeft=document.querySelector('.preview-wrap').scrollLeft});
$('workspaceScroll').addEventListener('scroll',()=>{const viewport=document.querySelector('.preview-wrap');if(viewport.scrollLeft!==$('workspaceScroll').scrollLeft)viewport.scrollLeft=$('workspaceScroll').scrollLeft});
document.addEventListener('input', scheduleDriveSync);
document.querySelector('#printArea').addEventListener('focusin',e=>{if(e.target.getAttribute('contenteditable')==='true')lastEditable=e.target});
document.addEventListener('selectionchange',()=>{const selection=window.getSelection();if(!selection.rangeCount)return;let node=selection.anchorNode;if(node?.nodeType===3)node=node.parentElement;const editable=node?.closest?.('[contenteditable="true"]');if(editable&&document.querySelector('#printArea').contains(editable)){lastEditable=editable;lastEditableRange=selection.getRangeAt(0).cloneRange()}});
document.querySelector('#printArea').addEventListener('pointerup',e=>{if(!awaitingPageBreak)return;const editable=e.target.closest?.('[contenteditable="true"]');if(!editable)return;setTimeout(()=>{const selection=window.getSelection();if(selection.rangeCount){lastEditable=editable;lastEditableRange=selection.getRangeAt(0).cloneRange();applyPageBreakAtCursor()}},0)});
let dragState=null,resizeState=null;document.querySelector('#printArea').addEventListener('pointerdown',e=>{if(!state.settings.freeLayout)return;const resize=e.target.closest('.resize-handle');if(resize){const block=resize.closest('[data-drag-key]'),rect=block.getBoundingClientRect(),current=state.layout[block.dataset.dragKey]||{x:0,y:0};resizeState={block,key:block.dataset.dragKey,corner:resize.dataset.corner,startX:e.clientX,startY:e.clientY,width:rect.width,height:rect.height,x:current.x||0,y:current.y||0};e.preventDefault();return}if(e.target.closest('button,.drag-handle'))return;const block=e.target.closest('[data-drag-key]');if(!block)return;const current=state.layout[block.dataset.dragKey]||{x:0,y:0};dragState={block,key:block.dataset.dragKey,startX:e.clientX,startY:e.clientY,x:current.x,y:current.y,moved:false}});document.addEventListener('pointermove',e=>{if(resizeState){const r=resizeState,dx=e.clientX-r.startX,dy=e.clientY-r.startY,left=r.corner.includes('w'),top=r.corner.includes('n');let width=Math.max(42,r.width+(left?-dx:dx)),height=Math.max(20,r.height+(top?-dy:dy)),x=r.x+(left?dx:0),y=r.y+(top?dy:0);r.block.style.width=`${width}px`;r.block.style.height='auto';if(!r.block.classList.contains('image-card'))height=Math.max(height,r.block.scrollHeight);r.block.style.height=`${height}px`;r.block.style.transform=`translate(${x}px, ${y}px)`;state.layout[r.key]={x,y,width,height,scale:Math.max(.65,Math.min(1.8,width/(Number(r.block.dataset.baseWidth)||r.width)))};return}if(!dragState)return;const dx=e.clientX-dragState.startX,dy=e.clientY-dragState.startY;if(!dragState.moved&&Math.hypot(dx,dy)<4)return;dragState.moved=true;const x=dragState.x+dx,y=dragState.y+dy;dragState.block.style.transform=`translate(${x}px, ${y}px)`;state.layout[dragState.key]={x,y};e.preventDefault()});document.addEventListener('pointerup',()=>{const changed=Boolean(dragState||resizeState);dragState=null;resizeState=null;if(changed){save();scheduleDriveSync()}});
let mouseDrag=null;document.querySelector('#printArea').addEventListener('mousedown',e=>{if(!state.settings.freeLayout||e.button!==0||e.target.closest('button,.resize-handle'))return;const block=e.target.closest('[data-drag-key]');if(!block)return;const current=state.layout[block.dataset.dragKey]||{x:0,y:0};mouseDrag={block,key:block.dataset.dragKey,startX:e.clientX,startY:e.clientY,x:current.x||0,y:current.y||0,moved:false}});document.addEventListener('mousemove',e=>{if(!mouseDrag)return;const dx=e.clientX-mouseDrag.startX,dy=e.clientY-mouseDrag.startY;if(!mouseDrag.moved&&Math.hypot(dx,dy)<3)return;mouseDrag.moved=true;const x=mouseDrag.x+dx,y=mouseDrag.y+dy;mouseDrag.block.style.transform=`translate(${x}px, ${y}px)`;state.layout[mouseDrag.key]={...(state.layout[mouseDrag.key]||{}),x,y};e.preventDefault()});document.addEventListener('mouseup',()=>{if(!mouseDrag)return;const moved=mouseDrag.moved;mouseDrag=null;if(moved){save();scheduleDriveSync()}});
function addFreeImage(file){if(!file?.type?.startsWith('image/'))return;const reader=new FileReader();reader.onload=()=>{state.images.push(reader.result);render();scheduleDriveSync()};reader.readAsDataURL(file)}
document.querySelector('#printArea').addEventListener('dragover',e=>{if(state.settings.freeLayout)e.preventDefault()});document.querySelector('#printArea').addEventListener('drop',e=>{if(!state.settings.freeLayout)return;e.preventDefault();addFreeImage(e.dataTransfer.files[0])});document.querySelector('#printArea').addEventListener('paste',e=>{if(!state.settings.freeLayout)return;const image=[...e.clipboardData.items].find(item=>item.type.startsWith('image/'));if(image){e.preventDefault();addFreeImage(image.getAsFile())}});
// Do not let the browser create a second, native drag preview for an image.
document.querySelector('#printArea').addEventListener('dragstart',e=>{if(state.settings.freeLayout&&e.target.closest('img,.image-card'))e.preventDefault()});
document.querySelector('#printArea').addEventListener('input',e=>{const el=e.target;if(el.id==='previewNumber'){$('sectionNumber').value=el.innerText.trim()}else if(el.id==='previewSectionTitle'){$('sectionTitle').value=el.innerText.trim()}else if(el.id==='previewMainNote'){$('mainNote').value=el.innerText.trim()}else if(el.dataset.sectionIndex!==undefined){const section=state.sections[Number(el.dataset.sectionIndex)];if(section)section[el.dataset.sectionField]=el.innerText.trim()}});
document.querySelector('#printArea').addEventListener('click',e=>{const tool=e.target.closest('[data-page-break-index]');if(tool){const section=state.sections[Number(tool.dataset.pageBreakIndex)];if(section){section.newPage=true;renderEditors();render();scheduleDriveSync()}return}if(!state.settings.freeLayout||e.target.closest('button,.resize-handle'))return;const block=e.target.closest('[data-drag-key]');if(block)selectComponent(block.dataset.dragKey)});
document.addEventListener('keydown',e=>{if(!state.settings.freeLayout||e.target.matches('input,textarea,[contenteditable="true"]'))return;const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(!direction)return;e.preventDefault();if(direction==='left'||direction==='right')panFreeWorkspace(direction);else if(selectedComponentKey)moveSelectedComponent(direction,e.shiftKey?30:12)});
