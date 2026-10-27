import { qrcodegen } from './vendor/qrcodegen.js';
import { contactCode } from './contact-code.js';

export function drawContactQr(canvas,code,origin=location.origin) {
  const qr = qrcodegen.QrCode.encodeText(origin + '/#connect/' + code,qrcodegen.QrCode.Ecc.MEDIUM);
  const scale = 7, border = 4;
  canvas.width = canvas.height = (qr.size + border * 2) * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle = '#16251c';
  for (let y=0;y<qr.size;y++) for (let x=0;x<qr.size;x++)
    if (qr.getModule(x,y)) context.fillRect((x+border)*scale,(y+border)*scale,scale,scale);
}

export async function scanCustomer(video,{ signal,onCode,onError }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Deze browser heeft geen cameratoegang. Vul de code hieronder in.');
  const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const stop = () => { stream.getTracks().forEach(track=>track.stop()); video.srcObject=null; };
  if (signal.aborted) { stop(); return; }
  signal.addEventListener('abort',stop,{once:true});
  video.srcObject=stream;
  try { await video.play(); } catch { stop(); throw new Error('De camera kon niet starten. Vul de code hieronder in.'); }
  const { default:decode } = await import('./vendor/jsQR.js');
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  let last=0,seen='';
  function frame(now) {
    if (signal.aborted) return;
    if (now-last>180 && video.readyState>=2 && video.videoWidth) {
      last=now;
      canvas.width=Math.min(video.videoWidth,720);
      canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const result=decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:'dontInvert'});
      if (result && result.data!==seen) {
        seen=result.data;
        const code=contactCode(result.data,location.origin);
        if (code) { stop(); onCode(code); return; }
        onError('Dit is geen Conappt-klantcode. Scan de QR-code op de Home-pagina van je klant.');
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
