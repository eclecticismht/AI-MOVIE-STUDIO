(function(root){
 function visualNotes(ref){
  const text=String(ref.notes||'');
  const markers=['State for this shot only:','Exact silent screen text for this shot:','Unsent draft:'];
  const positions=markers.map(m=>text.indexOf(m)).filter(i=>i>=0);
  if(positions.length)return text.slice(Math.min(...positions));
  // This sentence is produced by the presence selector, not an asset biography.
  if(text.startsWith('This portrait appears ONLY inside')||text==='ONLY inside the screen')return text;
  if(ref.kind==='characters')return 'Use the visible appearance in the supplied portrait; do not add clothing or props from biographical history.';
  if(ref.kind==='scenes')return 'Use only the architecture, spatial layout and furnishings visible in the supplied environment image. Time, people and action come exclusively from this shot, never from the asset history.';
  return 'Use only the shape, material and color visible in the supplied reference image. Current state and action come exclusively from this shot, never from the asset history.';
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=visualNotes;else root.ReferenceVisualNotes=visualNotes;
})(typeof globalThis!=='undefined'?globalThis:this);
