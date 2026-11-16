// A quiet synthesized wind bed, created only after the visitor enables it.
export function createWindAmbience({windowRef=window,documentRef=document}={}){
 let context=null,enabled=false;
 const onVisibility=()=>{
  if(!context||!enabled)return;
  const operation=documentRef.hidden?context.suspend():context.resume();
  operation?.catch?.(()=>{});
 };
 documentRef.addEventListener('visibilitychange',onVisibility);
 function initialize(){
  const AudioContext=windowRef.AudioContext??windowRef.webkitAudioContext;
  if(!AudioContext)throw new Error('Web Audio is unavailable');
  context=new AudioContext();
  try{
  const noise=context.createBuffer(1,context.sampleRate*4,context.sampleRate);
  const data=noise.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const source=context.createBufferSource();source.buffer=noise;source.loop=true;
  const lowpass=context.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=470;
  const highpass=context.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=90;
  const volume=context.createGain();volume.gain.value=.025;
  const swell=context.createOscillator();swell.frequency.value=.08;
  const sway=context.createGain();sway.gain.value=.006;
  source.connect(lowpass);lowpass.connect(highpass);highpass.connect(volume);volume.connect(context.destination);
  swell.connect(sway);sway.connect(volume.gain);source.start();swell.start();
  }catch(error){const failed=context;context=null;failed.close?.().catch?.(()=>{});throw error;}
 }
 return {
  isEnabled:()=>enabled,
  async setEnabled(value){
   if(value){
    if(!context)initialize();
    if(!documentRef.hidden)await context.resume();
    enabled=true;
   }else{
    enabled=false;
    if(context)await context.suspend();
   }
   return enabled;
  },
  async destroy(){enabled=false;documentRef.removeEventListener('visibilitychange',onVisibility);if(context)await context.close();context=null;},
 };
}
