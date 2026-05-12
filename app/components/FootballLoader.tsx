export function FootballLoader() { 
  return ( 
  <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm"> 
  <div className="relative flex items-center justify-center"> {/* мʼяч */} 
    <div className="h-14 w-14 animate-spin-slow"> ⚽ </div> {/* пульс */} 
    <div className="absolute h-20 w-20 rounded-full border border-white/20 animate-ping" /> 
    </div> 
  </div> 
  ); 
}