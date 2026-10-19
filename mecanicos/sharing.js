'use strict';
// El PDF se construye sin esperas antes de navigator.share: conserva el gesto del usuario.
exportPdf=async function(row){
  const trigger=$('pdf');
  try{
    notice('Generando reporte PDF…');
    const blob=pdfBlob(row);
    const name='SierraMadre-'+String(row.folio||row.id||Date.now()).replace(/[^a-z0-9-]/gi,'')+'.pdf';
    if(window.MechanicAndroid){
      const reader=new FileReader();
      reader.onerror=()=>shareError('No se pudo preparar el archivo para Android.');
      reader.onload=()=>{try{MechanicAndroid.sharePdf(name,String(reader.result).split(',')[1]);notice('PDF listo. Selecciona WhatsApp en Compartir.');}catch(e){shareError(e.message);}};
      reader.readAsDataURL(blob);return;
    }
    const file=new File([blob],name,{type:'application/pdf'});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      // Llamada inmediata, en la misma acción del botón PDF / Compartir.
      const result=navigator.share({files:[file],title:'Reporte de trabajo · Sierra Madre'});
      notice('Selecciona WhatsApp o WhatsApp Business.');
      await result;notice('Reporte entregado a la aplicación seleccionada.');
    }else{
      downloadPdf(blob,name);
      shareError('Este navegador no permite compartir archivos PDF. El PDF se descargó. En Android, abre esta PWA en Chrome o utiliza el APK de Mecánicos Sierra Madre.');
    }
  }catch(e){
    if(e.name==='AbortError'){notice('Se canceló el selector. Pulsa PDF / Compartir para abrirlo nuevamente.');return;}
    shareError('No se pudo abrir Compartir: '+e.name+' · '+e.message);
  }
};
function downloadPdf(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
function shareError(message){document.getElementById('share-error')?.remove();const dialog=document.createElement('dialog');dialog.id='share-error';const h=document.createElement('h2');h.textContent='Envío del PDF';const p=document.createElement('p');p.textContent=message;const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>dialog.close();dialog.append(h,p,close);document.body.append(dialog);dialog.showModal();notice(message);}
$('pdf').onclick=()=>{const row=save();if(row)exportPdf(row);};
