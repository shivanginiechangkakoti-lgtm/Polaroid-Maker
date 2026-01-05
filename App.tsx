import React, { useState, useRef, useCallback } from 'react';
import { Download, RefreshCw, Smartphone, Zap, Instagram, ArrowUpRight } from 'lucide-react';

export default function App() {
  const [previewImage, setPreviewImage] = useState<string | null>(null); // Just the cropped photo for UI
  const [polaroidDataUrl, setPolaroidDataUrl] = useState<string | null>(null); // Full baked card for download
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeveloped, setIsDeveloped] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // --- Audio Synthesis ---
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playShutterSound = useCallback(() => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const t = ctx.currentTime;

    // --- SOUND PART 1: "KA" (Mirror Slap) ---
    // A heavy, low-frequency impact to simulate the mirror flipping up
    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(120, t);
    osc1.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.5, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    
    // Lowpass filter to muffle the square wave squareness
    const filter1 = ctx.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.frequency.value = 300;

    osc1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.1);


    // --- SOUND PART 2: "CHIK" (Shutter Mechanism) ---
    // Occurs 50ms after the slap
    const t2 = t + 0.05; 

    // A. The "Snap" (High frequency noise burst)
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000; // Crisp high end

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, t2);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t2 + 0.06); // Fast decay

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t2);
    
    // B. The "Metallic Ring" (Tiny ping for realism)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(2500, t2);
    osc2.frequency.exponentialRampToValueAtTime(1000, t2 + 0.04);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.2, t2);
    gain2.gain.exponentialRampToValueAtTime(0.01, t2 + 0.04);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t2);
    osc2.stop(t2 + 0.1);
  }, []);

  const playMotorSound = useCallback(() => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const t = ctx.currentTime;
    const duration = 2.0;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, t);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
    gain.gain.linearRampToValueAtTime(0.1, t + duration - 0.1);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
  }, []);

  // --- Logic ---

  const handleCameraClick = () => {
    if (!isProcessing && !previewImage && fileInputRef.current) {
      initAudio();
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      playShutterSound();
      processImage(file);
    }
    e.target.value = '';
  };

  const processImage = (file: File) => {
    setIsProcessing(true);
    setIsDeveloped(false);
    
    setTimeout(() => playMotorSound(), 400);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // --- CONSTANTS ---
        // Instax Mini Ratio: Film is 54x86mm. Image is 46x62mm.
        // Scale Factor: x12 for high res
        const cardWidth = 648;  
        const cardHeight = 1032; 
        const cornerRadius = 30;
        
        const imgWidth = 552;   
        const imgHeight = 744;  
        
        const sideMargin = (cardWidth - imgWidth) / 2; // 48
        const topMargin = sideMargin; 
        
        // --- 1. PREPARE CROPPED IMAGE (For Canvas & Preview) ---
        // We calculate crop coordinates based on aspect ratio
        let sx, sy, sWidth, sHeight;
        const targetRatio = imgWidth / imgHeight;
        const sourceRatio = img.width / img.height;

        if (sourceRatio > targetRatio) {
           sHeight = img.height;
           sWidth = img.height * targetRatio;
           sx = (img.width - sWidth) / 2;
           sy = 0;
        } else {
           sWidth = img.width;
           sHeight = img.width / targetRatio;
           sx = 0;
           sy = (img.height - sHeight) / 2;
        }

        // --- 2. GENERATE FULL DOWNLOADABLE CARD (CANVAS) ---
        const canvas = document.createElement('canvas');
        canvas.width = cardWidth;
        canvas.height = cardHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw Card Shape
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
            // TypeScript might not know about roundRect yet in all envs
            (ctx as any).roundRect(0, 0, cardWidth, cardHeight, cornerRadius);
        } else {
            ctx.rect(0, 0, cardWidth, cardHeight); // Fallback
        }
        ctx.clip();

        // Paper Texture Background
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(0, 0, cardWidth, cardHeight);
        
        // Draw Image
        ctx.drawImage(img, sx, sy, sWidth, sHeight, sideMargin, topMargin, imgWidth, imgHeight);

        // --- EFFECTS (Grain & Gloss) ---
        
        // 1. Vignette
        const vignette = ctx.createRadialGradient(
            cardWidth/2, topMargin + imgHeight/2, imgWidth * 0.4,
            cardWidth/2, topMargin + imgHeight/2, imgWidth * 0.9
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vignette;
        ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);

        // 2. Reduced Grain
        const imageData = ctx.getImageData(sideMargin, topMargin, imgWidth, imgHeight);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Less intensity (was 20, now 10)
            const noise = (Math.random() - 0.5) * 10; 
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
        }
        ctx.putImageData(imageData, sideMargin, topMargin);

        // 3. Glossy Reflection Overlay
        // Linear gradient across the whole photo area to simulate plastic reflection
        const gloss = ctx.createLinearGradient(sideMargin, topMargin, sideMargin + imgWidth, topMargin + imgHeight);
        gloss.addColorStop(0, 'rgba(255,255,255,0.1)');
        gloss.addColorStop(0.4, 'rgba(255,255,255,0)');
        gloss.addColorStop(0.5, 'rgba(255,255,255,0.2)'); // The shine line
        gloss.addColorStop(0.6, 'rgba(255,255,255,0)');
        gloss.addColorStop(1, 'rgba(255,255,255,0.1)');
        ctx.fillStyle = gloss;
        ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);

        // 4. Inner Shadow (Depth)
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sideMargin, topMargin, imgWidth, imgHeight);

        // Save Final High Res
        setPolaroidDataUrl(canvas.toDataURL('image/png'));

        // --- 3. GENERATE PREVIEW IMAGE (Just the crop) ---
        // We use a separate canvas for the preview image so we can 
        // display it inside a CSS-constructed frame in the UI.
        const prevCanvas = document.createElement('canvas');
        prevCanvas.width = imgWidth;
        prevCanvas.height = imgHeight;
        const pCtx = prevCanvas.getContext('2d');
        
        if (pCtx) {
            pCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, imgWidth, imgHeight);
            // Apply same effects to preview
            pCtx.fillStyle = vignette;
            pCtx.fillRect(0, 0, imgWidth, imgHeight);
            pCtx.putImageData(imageData, 0, 0); // Re-use grain data (it matches size)
            
            // Adjust gloss coordinates for 0,0 origin
            const pGloss = pCtx.createLinearGradient(0, 0, imgWidth, imgHeight);
            pGloss.addColorStop(0, 'rgba(255,255,255,0.1)');
            pGloss.addColorStop(0.4, 'rgba(255,255,255,0)');
            pGloss.addColorStop(0.5, 'rgba(255,255,255,0.2)');
            pGloss.addColorStop(0.6, 'rgba(255,255,255,0)');
            pGloss.addColorStop(1, 'rgba(255,255,255,0.1)');
            pCtx.fillStyle = pGloss;
            pCtx.fillRect(0, 0, imgWidth, imgHeight);

            setPreviewImage(prevCanvas.toDataURL('image/png'));
        }

        // Animation Triggers
        setTimeout(() => {
          setIsProcessing(false); // Eject
          setTimeout(() => {
             setIsDeveloped(true); // Fade to image
          }, 3500); 
        }, 600);
      };
      if (event.target && event.target.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (polaroidDataUrl) {
      const link = document.createElement('a');
      link.download = `polaroid-${Date.now()}.png`;
      link.href = polaroidDataUrl;
      link.click();
    }
  };

  const reset = () => {
    setPreviewImage(null);
    setPolaroidDataUrl(null);
    setIsDeveloped(false);
  };

  return (
    <div className="min-h-screen bg-[#e3e3e3] font-sans text-stone-800 flex flex-col items-center justify-center p-4 overflow-hidden relative selection:bg-stone-400">
      
      {/* Background Texture */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#999 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      </div>

      <div className="z-10 w-full max-w-2xl flex flex-col items-center gap-10 md:gap-24 lg:gap-32">
        
        {/* Header */}
        <div className="text-center space-y-1 z-20">
          <h1 className="text-4xl font-black tracking-tighter text-stone-800 flex items-center justify-center gap-3">
             Polaroid Maker
          </h1>
          <p className="text-stone-500 text-sm font-medium tracking-wide uppercase">Instant Digi Films</p>
        </div>

        {/* The Camera Interface */}
        <div className={`
          relative group perspective-1000 
          transform transition-transform duration-500 origin-center
          scale-[0.55] sm:scale-100 md:scale-125 lg:scale-150
          ${previewImage ? 'translate-x-[12%] sm:translate-x-0' : ''}
        `}>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />

          {/* Camera Body */}
          <div 
            className={`
              relative w-[340px] h-[220px] bg-stone-900 rounded-[20px] shadow-2xl 
              transition-transform duration-300 ease-out 
              flex items-center justify-center select-none z-20
              ${!previewImage ? 'hover:scale-[1.02] cursor-pointer' : ''}
            `}
            onClick={handleCameraClick}
            style={{
                background: `linear-gradient(to bottom, #d4d4d4 0%, #a0a0a0 15%, #1a1a1a 15.1%, #1a1a1a 85%, #a0a0a0 85.1%, #d4d4d4 100%)`
            }}
          >
            {/* Real Leather Texture */}
            <div className="absolute top-[15.1%] bottom-[15%] left-0 right-0 bg-[#151515]"
                style={{ 
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.6\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.3\'/%3E%3C/svg%3E")',
                    backgroundSize: '150px' 
                }}>
            </div>

            {/* Silver Plate Highlights */}
            <div className="absolute top-0 w-full h-[15%] rounded-t-[20px] bg-gradient-to-b from-[#e8e8e8] to-[#b0b0b0] border-b border-stone-600"></div>
            <div className="absolute bottom-0 w-full h-[15%] rounded-b-[20px] bg-gradient-to-b from-[#b0b0b0] to-[#909090] border-t border-stone-600"></div>
            
            {/* Screws */}
            <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-[inset_1px_1px_1px_rgba(0,0,0,0.5)]"></div>
            <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-[inset_1px_1px_1px_rgba(0,0,0,0.5)]"></div>
            <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-[inset_1px_1px_1px_rgba(0,0,0,0.5)]"></div>
            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-[inset_1px_1px_1px_rgba(0,0,0,0.5)]"></div>

            {/* Flash Unit */}
            <div className="absolute top-[25%] right-8 w-12 h-8 bg-[#2a2a2a] rounded border border-stone-600 shadow-md flex items-center justify-center">
                 <div className="w-10 h-6 bg-yellow-50/10 border border-white/20 relative overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_20%,_#000_100%)] opacity-50"></div>
                    <Zap className="w-4 h-4 text-white/40" />
                 </div>
            </div>

            {/* Shutter Button */}
            <div className="absolute top-[45%] right-8 w-10 h-10 rounded-full bg-gradient-to-br from-[#333] to-black border-2 border-[#666] shadow-[0_4px_6px_rgba(0,0,0,0.5)] active:scale-95 transition-transform flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border border-[#444] bg-[#1a1a1a]"></div>
            </div>

            {/* Power Dial */}
            <div className="absolute top-[-8px] right-10 w-14 h-3 bg-gradient-to-r from-stone-400 to-stone-300 rounded-t-lg border-t border-white/50 shadow-md flex justify-evenly px-1">
                 {[1,2,3,4].map(i => <div key={i} className="w-[1px] h-full bg-stone-500 opacity-50"></div>)}
            </div>

            {/* Print Lever */}
            <div className="absolute top-[-6px] left-10 w-10 h-5 bg-[#1a1a1a] rounded-t shadow-md border-t border-stone-600"></div>

            {/* Lens Housing */}
            <div className="relative right-4 w-44 h-44 rounded-full bg-gradient-to-br from-[#d4d4d4] to-[#999] shadow-[6px_6px_20px_rgba(0,0,0,0.5)] flex items-center justify-center group-active:scale-[0.99] transition-transform duration-100">
               {/* Knurling Ring */}
               <div className="absolute inset-0 rounded-full border-[4px] border-dashed border-stone-500 opacity-20 animate-spin-slow" style={{ animationDuration: '60s' }}></div>
               
               {/* Inner Housing */}
               <div className="w-36 h-36 rounded-full bg-[#111] border-[4px] border-[#bbb] relative overflow-hidden flex items-center justify-center shadow-inner">
                  
                  {/* Selfie Mirror */}
                  <div className="absolute top-8 right-8 w-4 h-4 rounded-full bg-gradient-to-br from-white to-stone-300 border border-stone-400 shadow-[0_0_5px_rgba(255,255,255,0.8)] z-20"></div>

                  {/* Glass Elements */}
                  <div className="w-24 h-24 rounded-full bg-black border-[2px] border-[#333] relative flex items-center justify-center overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,1)]">
                      <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/40 via-blue-500/10 to-transparent pointer-events-none"></div>
                      
                      {/* Lens Reflections */}
                      <div className="absolute top-5 left-5 w-6 h-3 bg-white/20 rounded-[50%] -rotate-45 blur-[2px]"></div>
                      <div className="absolute bottom-6 right-8 w-2 h-2 bg-white/30 rounded-full blur-[1px]"></div>
                      
                      {!previewImage ? (
                        <div className="relative z-30 text-stone-300 flex flex-col items-center animate-pulse cursor-pointer">
                            <Smartphone className="w-5 h-5 mb-1 opacity-70" />
                            <span className="text-[8px] tracking-[0.2em] uppercase text-stone-500">Tap</span>
                        </div>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-red-900 shadow-[0_0_8px_rgba(255,0,0,0.8)] animate-pulse"></div>
                      )}
                  </div>

                  {/* Text Ring */}
                  <div className="absolute inset-0 rounded-full pointer-events-none">
                      <svg viewBox="0 0 100 100" className="w-full h-full opacity-50">
                          <path id="curve" d="M 18,50 a 32,32 0 1,1 64,0" fill="transparent" />
                          <text width="100" className="text-[4px] fill-white uppercase tracking-[1.5px] font-medium">
                              <textPath xlinkHref="#curve" startOffset="50%" textAnchor="middle">
                                  Polaroid Lens 60mm Focus
                              </textPath>
                          </text>
                      </svg>
                  </div>
               </div>
            </div>
          </div>

          {/* The Film Slot */}
          <div className="absolute top-[50%] left-[-20px] w-[20px] h-[120px] bg-[#111] z-10 rounded-l-md -translate-y-1/2 shadow-xl"></div>

          {/* THE FILM PREVIEW 
            This is built with CSS to perfectly match the developing animation logic
            Dimensions: Based on Instax Mini 54x86 ratio ~ 0.627
            Width 160px, Height ~255px
          */}
          {previewImage && (
            <div className="absolute top-1/2 left-[-15px] -translate-y-1/2 z-0 flex items-center">
                <div 
                    className={`
                        bg-white shadow-[0_15px_35px_rgba(0,0,0,0.3)] transform origin-right rounded-lg
                        transition-all duration-[2000ms] ease-linear overflow-hidden flex flex-col items-center
                        ${isProcessing ? 'translate-x-[20px] opacity-0 scale-95' : '-translate-x-[100%] opacity-100 scale-100 rotate-[-6deg]'}
                    `}
                    style={{ 
                        width: '160px', 
                        height: '254px',
                        padding: '12px 12px 0 12px' // Top/Side padding
                    }} 
                >
                    {/* The Inner Image Container */}
                    <div className="relative w-full aspect-[46/62] bg-[#111] overflow-hidden shadow-[inset_0_0_2px_rgba(0,0,0,0.2)]">
                         
                         {/* The Image (Cropped) */}
                         <img 
                            src={previewImage} 
                            alt="Developed Film" 
                            className={`
                                w-full h-full object-cover
                                transition-all duration-[4500ms] ease-in-out
                                ${isProcessing ? 'opacity-0 brightness-0' : 'opacity-100 brightness-100'}
                            `}
                         />
                         
                         {/* Developing Chemical Overlay (Fades out) */}
                         <div className={`absolute inset-0 bg-[#080808] pointer-events-none transition-opacity duration-[4500ms] ease-in-out ${isDeveloped ? 'opacity-0' : 'opacity-95'}`}></div>
                    </div>

                    {/* Bottom part (Writeable area) is handled by the container's remaining height and background color */}
                    <div className="flex-1 w-full bg-white"></div>
                </div>
            </div>
          )}

        </div>

        {/* Controls */}
        <div className={`
            flex flex-col items-center gap-4 transition-all duration-700 delay-[2500ms]
            ${previewImage && !isProcessing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}
        `}>
             <div className="flex gap-6">
                 <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 bg-stone-800 hover:bg-black text-white px-8 py-3 rounded-sm font-bold uppercase tracking-wider text-sm shadow-xl hover:shadow-2xl transition-all active:translate-y-0.5"
                 >
                    <Download className="w-4 h-4" />
                    Save Film
                 </button>

                 <button 
                    onClick={reset}
                    className="flex items-center gap-2 bg-transparent hover:bg-stone-200 text-stone-600 border-2 border-stone-400 px-6 py-3 rounded-sm font-bold uppercase tracking-wider text-sm transition-all active:translate-y-0.5"
                 >
                    <RefreshCw className="w-4 h-4" />
                    Retake
                 </button>
             </div>
             
             <a 
               href="https://instagram.com/kenkeniiiii" 
               target="_blank" 
               rel="noopener noreferrer"
               className="group flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] text-stone-400 hover:text-stone-800 transition-all duration-300 uppercase"
             >
               <Instagram className="w-3 h-3 transition-transform group-hover:scale-110" />
               <span className="border-b border-transparent group-hover:border-stone-800 pb-0.5">follow @kenkeniiiii for more</span>
               <ArrowUpRight className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
             </a>
        </div>
      </div>
    </div>
  );
}