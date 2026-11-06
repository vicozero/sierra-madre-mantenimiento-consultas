/* SIERRA MADRE · Envoltura visual incremental. El motor del portal conserva sus contratos. */
'use strict';
(() => {
 const byId=id=>document.getElementById(id), charts=new Map();
 let trendDays=7, activeNav='control', lastConnection=null;
 const groups=[
  ['INICIO',true,[['control','Centro de control','house','control'],['executive','Dashboard ejecutivo','gauge','inicio']]],
  ['OPERACIÓN',true,[['daily','Captura diaria','clipboard-list'],['meters','Horómetros','clock-3','bitacora'],['log','Bitácora de equipos','notebook-tabs','bitacora'],['mechanics','Bitácora de mecánicos','notebook-pen','mecanicos'],['failures','Avisos de falla','triangle-alert'],['orders','Órdenes de trabajo','wrench'],['history','Historial','history','equipos'],['supervision','Disponibilidad','activity','supervision']]],
  ['MANTENIMIENTO',false,[['gamas','Gamas preventivas','settings-2'],['preventive','Servicios preventivos','calendar-check','calendario'],['special','Servicios especiales','badge-check'],['inspection','Inspecciones','clipboard-check'],['components','Cambio de componentes','cog']]],
  ['PLANEACIÓN',true,[['calendar','Calendario preventivo','calendar-days','calendario'],['master','Programa maestro','calendar-range'],['kanban','Kanban','columns-3'],['backlog','Backlog','list-todo'],['weekly','Plan semanal','calendar-clock']]],
  ['ALMACÉN',false,[['stock','Inventario','warehouse'],['parts','Refacciones','package'],['in','Entradas','package-plus'],['out','Salidas','package-minus'],['reserves','Reservas','package-check']]],
  ['COMPRAS',false,[['requisitions','Requisiciones','clipboard-pen'],['purchases','Órdenes de compra','shopping-cart'],['tracking','Seguimiento de materiales','truck']]],
  ['FLOTA',true,[['tires','Llantas','circle-dot'],['diesel','Diésel','fuel','diesel'],['trucks','Camiones de volteo','truck'],['light','Preventivos vehiculares','car','vehiculos']]],
  ['REPORTES',true,[['kpi','Indicadores KPI','chart-no-axes-combined','inicio'],['availability','Disponibilidad','gauge','inicio'],['utilization','Utilización','timer','inicio'],['mtbf','MTBF / TMEF','activity','inicio'],['mttr','MTTR / TMPR','timer-reset','inicio'],['costs','Costos','coins'],['management','Reportes gerenciales','file-chart-column','reportes']]],
  ['ADMINISTRACIÓN',false,[['users','Usuarios','users'],['roles','Roles y permisos','shield-check'],['audit','Auditoría','clipboard-list'],['config','Configuración','settings']]]
 ];
 function icons(){if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});}
 function buildNavigation(){
  byId('enterprise-nav').innerHTML=groups.map(([name,open,items])=>`<details class="enterprise-nav-group" ${open?'open':''}><summary><span>${name}</span><i data-lucide="chevron-down"></i></summary>${items.map(([id,label,icon,target])=>`<button class="enterprise-nav-link" data-nav-id="${id}" ${target?`data-view="${target}"`:'disabled aria-disabled="true"'} title="${target?label:'Disponible en una fase operativa posterior'}"><i data-lucide="${icon}"></i><span class="nav-label">${label}</span>${target?'':'<i class="nav-future-icon" data-lucide="lock-keyhole"></i>'}</button>`).join('')}</details>`).join('');
  icons();
 }
 function closeMobileMenu(){byId('enterprise-sidebar').classList.remove('is-open');byId('sidebar-scrim').hidden=true;byId('mobile-menu').setAttribute('aria-expanded','false');}
 function navigate(target,navId){if(navId)activeNav=navId;selectView({dataset:{view:target}});closeMobileMenu();}
 function synchronizeView(){
  document.body.classList.toggle('control-open',view==='control');
  byId('export-excel').disabled=view==='mecanicos';
  byId('export-excel').title=view==='mecanicos'?'La exportación CSV específica de mecánicos no está disponible en esta fase.':'Exportar los registros de la vista actual';
  const buttons=[...document.querySelectorAll('.enterprise-nav-link[data-view]')];
  if(!buttons.some(b=>b.dataset.navId===activeNav&&b.dataset.view===view))activeNav=buttons.find(b=>b.dataset.view===view)?.dataset.navId;
  for(const button of buttons){const active=button.dataset.navId===activeNav;button.classList.toggle('active',active);if(active){button.setAttribute('aria-current','page');button.closest('details').open=true;}else button.removeAttribute('aria-current');}
  if(view==='control')requestAnimationFrame(renderControl);
 }
 byId('enterprise-nav').addEventListener('click',event=>{const button=event.target.closest('button[data-view]');if(button&&!button.disabled)navigate(button.dataset.view,button.dataset.navId);});
 document.addEventListener('click',event=>{const target=event.target.closest('[data-open-view]');if(target)navigate(target.dataset.openView);});
 byId('sidebar-collapse').onclick=()=>{const collapsed=document.body.classList.toggle('side-collapsed');byId('sidebar-collapse').setAttribute('aria-expanded',String(!collapsed));byId('sidebar-collapse').setAttribute('aria-label',collapsed?'Expandir menú':'Plegar menú');for(const chart of charts.values())chart.resize();};
 byId('mobile-menu').onclick=()=>{byId('enterprise-sidebar').classList.add('is-open');byId('sidebar-scrim').hidden=false;byId('mobile-menu').setAttribute('aria-expanded','true');document.querySelector('.enterprise-nav-link.active')?.focus();};
 byId('sidebar-scrim').onclick=closeMobileMenu;
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMobileMenu();byId('mobile-menu').focus();}if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){event.preventDefault();byId('search').focus();}});
 byId('enterprise-alerts').onclick=()=>{navigate('control');requestAnimationFrame(()=>byId('control-alert-list').scrollIntoView({behavior:'smooth',block:'center'}));};
 byId('control-refresh').onclick=()=>refreshData();
 function metric(title,value,note,icon,tone,progress){
  const colors={blue:['#0879f9','#eaf3ff'],green:['#19ae77','#e7f8ef'],orange:['#f1a41c','#fff5df'],red:['#e3425b','#fff0f1'],purple:['#8a5cf6','#f3ecff'],cyan:['#15abc2','#e5f7fb']},color=colors[tone];
  const width=Number.isFinite(progress)?Math.min(100,Math.max(0,progress)):0;
  return `<article class="control-metric" style="--tone:${color[0]};--tone-soft:${color[1]}"><div class="control-metric-main"><span class="control-metric-icon"><i data-lucide="${icon}"></i></span><div><strong class="control-metric-value">${value}</strong><span class="control-metric-label">${title}</span></div></div><div class="control-metric-track"><span style="width:${width}%"></span></div><div class="control-metric-note"><i data-lucide="${Number.isFinite(progress)?'circle-check':'info'}"></i>${note}</div></article>`;
 }
 function chart(id,option){
  const host=byId(id);if(!host||host.clientWidth===0)return;
  if(!window.echarts){host.textContent='No se pudo cargar la biblioteca de gráficas.';return;}
  let instance=charts.get(id);if(!instance){instance=window.echarts.init(host,null,{renderer:'canvas'});charts.set(id,instance);}
  instance.setOption({animation:false,textStyle:{fontFamily:'Inter, sans-serif'},...option},true);instance.resize();
 }
 function emptyOption(message){return {graphic:[{type:'text',left:'center',top:'43%',style:{text:message,fill:'#91a2b5',font:'11px Inter',textAlign:'center',lineHeight:20}}]};}
 function groupedByDate(list){
  const dates=new Map();for(const row of list){if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||''))continue;const group=dates.get(row.date)||[];group.push(row);dates.set(row.date,group);}
  return [...dates].sort((a,b)=>a[0].localeCompare(b[0]));
 }
 function renderTrend(list){
  const groups=groupedByDate(list),last=groups.at(-1)?.[0];
  if(!last){chart('control-trend-chart',emptyOption('Sin cortes KPI para estos filtros'));byId('control-trend-note').textContent='Se conserva el alcance publicado; no se inventan mediciones.';return;}
  const anchor=dateAtNoon(last),cutoff=new Date(anchor);cutoff.setDate(cutoff.getDate()-trendDays+1);
  const selected=groups.filter(([date])=>dateAtNoon(date)>=cutoff),points=selected.map(([date,items])=>[dateAtNoon(date).getTime(),average(items,'availability')]);
  chart('control-trend-chart',{grid:{top:24,right:24,bottom:35,left:46},tooltip:{trigger:'axis',confine:true,formatter:params=>{const item=params[0];return `${esc(formatDate(new Date(item.value[0]).toISOString().slice(0,10)))}<br>Disponibilidad: <b>${fmt(item.value[1])}%</b>`;}},xAxis:{type:'time',min:cutoff.getTime()-3600000,max:anchor.getTime()+3600000,axisLine:{lineStyle:{color:'#dfe9f4'}},axisTick:{show:false},axisLabel:{color:'#8297af',fontSize:8,hideOverlap:true,formatter:value=>new Date(value).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})},splitLine:{show:false}},yAxis:{type:'value',min:0,max:100,axisLabel:{color:'#92a3b7',fontSize:8,formatter:'{value}%'},splitLine:{lineStyle:{color:'#edf2f8',type:'dashed'}}},series:[{name:'Disponibilidad',type:'line',data:points,connectNulls:false,smooth:false,symbol:'circle',symbolSize:7,itemStyle:{color:'#0879f9',borderColor:'#fff',borderWidth:2},lineStyle:{width:3,color:'#0879f9'},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#0879f92b'},{offset:1,color:'#0879f903'}]}}}]});
  byId('control-trend-scope').textContent=`Cortes publicados · referencia ${formatDate(last)}`;
  byId('control-trend-note').textContent=`${selected.length} corte(s) en ${trendDays} días. No se infieren mediciones entre cortes.`;
 }
 function renderOrdersChart(list){
  if(!list.length){chart('control-orders-chart',{graphic:[{type:'circle',left:'center',top:'center',shape:{r:65},style:{stroke:'#eaf0f7',fill:'transparent',lineWidth:19}},{type:'text',left:'center',top:'37%',style:{text:'—',font:'600 30px Inter',fill:'#b3c0ce'}},{type:'text',left:'center',top:'58%',style:{text:'No publicado',font:'9px Inter',fill:'#90a1b5'}}]});byId('control-orders-note').textContent='El detalle de OT requiere la fase de acceso operativo.';return;}
  const states=new Map();for(const row of list)states.set(row.status||'Sin estado',(states.get(row.status||'Sin estado')||0)+1);
  chart('control-orders-chart',{color:['#0879f9','#f1a41c','#21b882','#92a3b7'],tooltip:{trigger:'item',confine:true},legend:{bottom:0,left:'center',textStyle:{color:'#728ba3',fontSize:8}},series:[{type:'pie',radius:['47%','68%'],center:['50%','43%'],label:{show:false},data:[...states].map(([name,value])=>({name,value})),itemStyle:{borderColor:'#fff',borderWidth:3}}],graphic:{type:'text',left:'center',top:'35%',style:{text:String(list.length),font:'700 25px Inter',fill:'#183d60'}}});
  byId('control-orders-note').textContent=`${list.length} órdenes dentro del filtro actual.`;
 }
 function priority(row){const state=calendarStatusKey(row.status);return state==='overdue'?0:state==='urgent'?1:state==='done'?4:2;}
 function isOpen(row){return !/complet|termin|realiz|ejecut|cancel/i.test(String(row.status||''));}
 function renderServices(list){
  const open=list.filter(isOpen).sort((a,b)=>priority(a)-priority(b)||String(a.date||'').localeCompare(String(b.date||''))),alerts=open.filter(r=>priority(r)<2);
  byId('control-alert-list').innerHTML=alerts.length?alerts.slice(0,3).map(row=>`<div class="control-alert-row ${priority(row)===1?'urgent':''}"><span class="control-alert-dot"></span><div><strong>${esc(row.equipment)} · ${esc(row.service||row.type||'Servicio')}</strong><small>${formatDate(row.date)}</small></div>${badge(row.status)}</div>`).join(''):'<p class="control-empty">Sin servicios vencidos o urgentes para estos filtros.</p>';
  byId('alert-badge').textContent=String(alerts.length);byId('alert-badge').hidden=!alerts.length;
  byId('enterprise-alerts').setAttribute('aria-label',`${alerts.length} servicios prioritarios en los filtros actuales`);
  byId('control-service-rows').innerHTML=open.length?open.slice(0,6).map(row=>{const meter=num(row.meter),target=num(row.target),remaining=meter!==null&&target!==null?target-meter:null;return `<tr><td><span class="equipment-cell"><i data-lucide="truck"></i>${esc(row.equipment||'Sin equipo')}</span></td><td>${esc(row.service||'Servicio')}</td><td>${meter===null?'Sin lectura':fmt(meter)+' '+esc(row.unit||'')}</td><td>${remaining===null?'—':fmt(remaining)+' '+esc(row.unit||'')}</td><td>${formatDate(row.date)}</td><td>${badge(row.status)}</td></tr>`;}).join(''):'<tr><td colspan="6" class="control-empty">Sin servicios pendientes para los filtros seleccionados.</td></tr>';
  const upcoming=open.filter(r=>priority(r)===2&&r.date&&dateAtNoon(r.date)>=dateAtNoon(isoDate(new Date()))).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(0,4);
  byId('control-upcoming-list').innerHTML=upcoming.length?upcoming.map(r=>`<div class="control-compact-row"><div><strong>${esc(r.equipment)}</strong><small>${esc(r.service||'Servicio')}</small></div><span>${formatDate(r.date)}</span></div>`).join(''):'<p class="control-empty">No hay servicios programados en el alcance seleccionado.</p>';
 }
 function renderFamilies(list){
  const families=new Map();for(const row of list){const name=row.family||'Sin familia';const group=families.get(name)||[];group.push(row);families.set(name,group);}
  const values=[...families].map(([name,items])=>({name,value:average(items,'availability')})).filter(r=>r.value!==null).sort((a,b)=>a.value-b.value);
  chart('control-family-chart',values.length?{grid:{left:140,right:35,top:8,bottom:25},tooltip:{trigger:'axis',confine:true,formatter:params=>`${esc(params[0].name)}<br>${fmt(params[0].value)}%`},xAxis:{type:'value',min:0,max:100,axisLabel:{fontSize:8,color:'#9aabbe',formatter:'{value}%'},splitLine:{lineStyle:{color:'#edf2f8'}}},yAxis:{type:'category',inverse:true,data:values.map(r=>r.name),axisLine:{show:false},axisTick:{show:false},axisLabel:{fontSize:8,color:'#6b829a',width:127,overflow:'truncate'}},series:[{type:'bar',data:values.map(r=>r.value),barMaxWidth:12,itemStyle:{color:'#3695fa',borderRadius:[0,4,4,0]},label:{show:true,position:'right',fontSize:8,color:'#577a9d',formatter:p=>fmt(p.value)+'%'}}]}:emptyOption('Sin KPI por familia en este filtro'));
 }
 function renderFailures(list){const groups=groupedByDate(list),values=groups.map(([date,items])=>[date,items.reduce((sum,r)=>sum+(num(r.stops)||0),0)]);
  chart('control-failures-chart',values.length?{grid:{left:35,right:15,top:15,bottom:40},tooltip:{trigger:'axis',confine:true},xAxis:{type:'category',data:values.map(r=>formatDate(r[0])),axisLabel:{fontSize:8,color:'#8399ae',hideOverlap:true},axisTick:{show:false},axisLine:{lineStyle:{color:'#dfe8f2'}}},yAxis:{type:'value',minInterval:1,axisLabel:{fontSize:8,color:'#94a6b9'},splitLine:{lineStyle:{color:'#eff3f8'}}},series:[{type:'bar',data:values.map(r=>r[1]),barMaxWidth:35,itemStyle:{color:'#6baef9',borderRadius:[5,5,0,0]}}]}:emptyOption('Sin registros de paros en este filtro'));
 }
 function renderConnection(){
  const online=lastConnection===true&&Boolean(data.schema);byId('control-sync-title').textContent=online?'Consulta conectada':data.schema?'Último corte conservado':'Esperando conexión';
  byId('control-sync-date').textContent=data.schema?'Corte del '+formatDateTime(data.meta.updatedAt):'Esperando el primer corte del programa';
  if(online)byId('data-status').textContent='Corte: '+formatDateTime(data.meta.updatedAt);
 }
 function renderControl(){
  const kpi=rows('kpi'),calendar=rows('calendar'),equipment=rows('equipment'),orders=rows('work_orders'),availability=average(kpi,'availability');
  const active=calendar.filter(r=>!/cancel/i.test(String(r.status||''))),complete=active.filter(r=>calendarStatusKey(r.status)==='done'),completion=active.length?complete.length/active.length*100:null;
  const overdue=calendar.filter(r=>calendarStatusKey(r.status)==='overdue').length,out=equipment.filter(r=>/fuera|no disponible|reparaci[oó]n|indisponible|^baja$/i.test(String(r.status||''))).length;
  byId('control-metrics').innerHTML=[
   metric('Disponibilidad mecánica',availability===null?'—':fmt(availability)+'%','Promedio de cortes KPI','chart-no-axes-combined','blue',availability),
   metric('Cumplimiento preventivo',completion===null?'—':fmt(completion)+'%','Servicios completados / total','circle-check','green',completion),
   metric('Órdenes abiertas',orders.length?String(orders.filter(isOpen).length):'—',orders.length?'Órdenes del corte':'No publicado en esta consulta','wrench','orange',null),
   metric('Servicios vencidos',data.schema?String(overdue):'—','Estado registrado en el programa','triangle-alert','red',null),
   metric('Equipos fuera de servicio',data.schema?String(out):'—','Catálogo y filtros seleccionados','truck','purple',null),
   metric('Backlog','—','Pendiente de API operativa','list-todo','cyan',null)
  ].join('');
  byId('enterprise-filter-summary').textContent=`${byId('family-filter').value||'Todas las familias'} · ${formatRange(byId('date-start').value,byId('date-end').value)}`;
  renderServices(calendar);renderConnection();
  const critical=aggregateByEquipment(kpi).filter(r=>conditionOf('kpi',r)==='critico').sort((a,b)=>(num(a.availability)||0)-(num(b.availability)||0));
  byId('control-critical-list').innerHTML=critical.length?critical.slice(0,4).map(r=>`<div class="control-compact-row"><div><strong>${esc(r.equipment)}</strong><small>${esc(r.family||'Sin familia')}</small></div><b>${fmt(r.availability)}%</b></div>`).join(''):'<p class="control-empty">Sin equipos críticos según los criterios actuales del portal.</p>';
  icons();if(view!=='control')return;
  renderTrend(kpi);renderOrdersChart(orders);renderFamilies(kpi);renderFailures(kpi);
 }
 document.querySelectorAll('[data-trend-days]').forEach(button=>button.addEventListener('click',()=>{trendDays=Number(button.dataset.trendDays);document.querySelectorAll('[data-trend-days]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderControl();}));
 window.addEventListener('sm:render',renderControl);window.addEventListener('sm:view',synchronizeView);
 window.addEventListener('sm:connection',event=>{lastConnection=event.detail.online;queueMicrotask(renderConnection);});
 window.addEventListener('offline',()=>setConnection(false,'Sin internet; se conserva el último corte.'));
 window.addEventListener('resize',()=>{if(innerWidth<=800){document.body.classList.remove('side-collapsed');byId('sidebar-collapse').setAttribute('aria-expanded','true');}});
 const resizeObserver=new ResizeObserver(()=>{for(const instance of charts.values())if(instance.getDom().clientWidth>0)instance.resize();});
 document.querySelectorAll('.control-chart').forEach(host=>resizeObserver.observe(host));
 buildNavigation();if(data.schema&&byId('connection-label').textContent==='Conectado')lastConnection=true;if(!location.hash)navigate('control');else synchronizeView();renderControl();
})();
