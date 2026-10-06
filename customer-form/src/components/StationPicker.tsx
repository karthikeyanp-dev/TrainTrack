'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, MapPin, Search, X } from 'lucide-react';
import { searchStations, STATIONS } from '@shared/bookingRequest';
import { Input } from '@/components/ui/input';

interface Props {
  id: string;
  label: string;
  code: string;
  onChange: (code: string) => void;
  error?: string;
  disabled?: boolean;
}

export function StationPicker({ id, label, code, onChange, error, disabled }: Props) {
  const selected = STATIONS.find((station) => station.code === code);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();
  const results = query.trim().length >= 2 ? searchStations(query).slice(0, 8) : [];

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  function choose(stationCode: string) {
    onChange(stationCode);
    setOpen(false);
    setActive(-1);
  }

  return <div className="relative">
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="relative">
      <MapPin className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <Input id={id} className="field !pl-12 !pr-10" placeholder="Type a station or city name" value={selected?.name ?? query}
        disabled={disabled} autoComplete="off" spellCheck={false} autoCorrect="off"
        role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open && !selected}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        onFocus={() => { clearTimeout(blurTimer.current); setOpen(true); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
          if (code) onChange('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((current) => event.key === 'ArrowDown' ? Math.min(current + 1, results.length - 1) : Math.max(current - 1, 0));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (open && active >= 0 && results[active]) choose(results[active].code);
          }
        }} />
      {code && !disabled && <button type="button" className="absolute right-2 top-2 rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label={`Clear ${label.toLowerCase()}`}
        onClick={() => { onChange(''); setQuery(''); document.getElementById(id)?.focus(); }}><X className="h-4 w-4" /></button>}
    </div>
    {selected ? <div id={`${id}-hint`} className="mt-2 flex items-start gap-2 text-sm text-primary">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span><strong>{selected.code}</strong>{[selected.city, selected.state].filter(Boolean).length > 0 && ` · ${[selected.city, selected.state].filter(Boolean).join(', ')}`}</span>
    </div> : <p id={`${id}-hint`} className="mt-2 text-xs text-muted-foreground">Choose the exact station from the suggestions.</p>}
    {open && !selected && query.trim().length >= 2 && <div id={listId} role="listbox" aria-label={`${label} suggestions`}
      className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-elevation-3">
      {results.length ? results.map((station, index) => <div key={station.code} role="option" id={`${listId}-${index}`} aria-selected={active === index}
        className={`cursor-pointer border-b px-4 py-3 last:border-0 ${active === index ? 'bg-secondary' : 'hover:bg-muted'}`}
        onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(station.code)}>
        <div className="flex items-center justify-between gap-3"><span className="font-semibold">{station.name}</span><span className="rounded bg-secondary px-2 py-1 text-xs font-bold text-primary">{station.code}</span></div>
        {[station.city, station.state].some(Boolean) && <div className="mt-1 text-xs text-muted-foreground">{[station.city, station.state].filter(Boolean).join(', ')}</div>}
      </div>) : <div className="px-4 py-4 text-sm text-muted-foreground"><Search className="mb-2 h-5 w-5" aria-hidden="true" />No matching station in our list. Try another spelling or a nearby city. If it is missing, ask your booking agent to help.</div>}
    </div>}
    {error && <p id={`${id}-error`} className="error">{error}</p>}
  </div>;
}
