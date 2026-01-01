import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export const TypeSelector = ({ value, options, onChange }: { value: string, options: string[], onChange: (val: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onChange(search);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen, search, onChange]);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={containerRef} className="relative w-1/3 flex items-center justify-end group/type">
       <input 
         className="bg-transparent text-right outline-none text-muted-foreground italic w-full text-xs"
         value={search}
         onFocus={() => setIsOpen(true)}
         onChange={(e) => setSearch(e.target.value)}
       />
       <ChevronDown className="w-2 h-2 text-muted-foreground/30 group-hover/type:text-muted-foreground transition-colors ml-1" />
       {isOpen && filtered.length > 0 && (
         <div 
           className="absolute top-full right-0 mt-2 w-48 glass-morphism z-[100] rounded-md shadow-2xl max-h-48 overflow-auto border border-white/10 p-1 animate-in fade-in slide-in-from-top-1 nodrag"
           onPointerDown={(e) => e.stopPropagation()}
           onMouseDown={(e) => e.stopPropagation()}
         >
           <div className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider font-bold">Suggestions</div>
           {filtered.map(opt => (
             <div 
               key={opt}
               className="px-2 py-1.5 text-xs hover:bg-primary/20 hover:text-primary cursor-pointer rounded transition-colors flex items-center justify-between"
               onMouseDown={(e) => {
                 setSearch(opt);
                 onChange(opt);
                 setIsOpen(false);
                 e.stopPropagation();
               }}
             >
               {opt}
               {opt === value && <div className="w-1 h-1 bg-primary rounded-full" />}
             </div>
           ))}
         </div>
       )}
    </div>
  );
};
