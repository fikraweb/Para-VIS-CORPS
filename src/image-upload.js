export async function prepareProductImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choisissez une image JPG, PNG ou WebP.');
 if(file.size>15*1024*1024)throw Error('Choisissez une photo de moins de 15 Mo.');
 const url=URL.createObjectURL(file),image=new Image();
 try{image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('Image illisible.');
 for(const max of [1600,1200,900]){const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 for(const quality of [.86,.72,.6,.5]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob&&blob.size<=350*1024){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {mime:blob.type,data:btoa(binary)};}}
 }throw Error('Cette image est trop lourde. Choisissez une photo plus légère.');
 }catch(error){if(error.name==='EncodingError')throw Error('Cette image ne peut pas être ouverte. Choisissez une autre photo.');throw error;}finally{URL.revokeObjectURL(url);}
}
