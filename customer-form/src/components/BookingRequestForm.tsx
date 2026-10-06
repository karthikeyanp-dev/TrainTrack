'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, ArrowUpDown, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, FileCheck2, HeartHandshake, Info, Loader2, LockKeyhole, MapPin, Plus, ShieldCheck, TrainFront, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customerBookingRequestSchema, customerBookingRequestSnapshotSchema, getIndiaToday, STATIONS, type CustomerBookingRequest } from '@shared/bookingRequest';
import { StationPicker } from './StationPicker';
import { isConfigured, previewEnabled } from '~/lib/firebase';
import { sendBookingRequest, submissionError } from '~/lib/api';

const STORAGE_KEY = 'traintrack-customer-draft-v1';
const draftSchema = z.object({
  source: z.string().max(10), destination: z.string().max(10), journeyDate: z.string().max(10),
  classPreference: z.string().max(30), bookingTypePreference: z.string().max(20),
  trainPreference: z.string().max(300), upgradeChoice: z.enum(['no', 'yes']), remarks: z.string().max(1200),
  contactName: z.string().max(100), phone: z.string().max(30),
  passengers: z.array(z.object({ name: z.string().max(100), age: z.string().max(3), gender: z.enum(['', 'M', 'F', 'O']), berthChoice: z.enum(['', 'yes', 'no']) })).min(1).max(6),
});
type Draft = z.infer<typeof draftSchema>;
type Traveller = Draft['passengers'][number];
const emptyTraveller = (): Traveller => ({ name: '', age: '', gender: '', berthChoice: '' });
const emptyDraft = (): Draft => ({ source: '', destination: '', journeyDate: '', classPreference: '', bookingTypePreference: '', trainPreference: '', upgradeChoice: 'no', remarks: '', contactName: '', phone: '', passengers: [emptyTraveller()] });
const savedDraftSchema = z.object({ version: z.literal(1), draft: draftSchema, requestId: z.string().uuid().optional() });
type SavedDraft = z.infer<typeof savedDraftSchema>;
type Errors = Record<string, string>;
const steps = [{ name: 'Your journey', icon: MapPin }, { name: 'Travellers', icon: Users }, { name: 'Check & send', icon: FileCheck2 }];
const classes = [
  ['SL', 'Sleeper', 'Non-AC berths'], ['3A', 'AC 3-tier', 'Air-conditioned berths'], ['2A', 'AC 2-tier', 'More space, AC berths'],
  ['1A', 'First AC', 'AC cabins / coupes'], ['2S', 'Second sitting', 'Non-AC seats'], ['CC', 'AC chair car', 'Air-conditioned seats'],
  ['3E', 'AC 3-tier economy', 'Air-conditioned berths'], ['EC', 'Executive chair car', 'Spacious AC seats'], ['UR', 'Unreserved', 'Agent will check options'],
] as const;

function fullDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T12:00:00+05:30`));
}
function stationName(code: string) {
  const station = STATIONS.find((entry) => entry.code === code);
  return station ? `${station.name} (${station.code})` : 'Choose a station';
}
function classLabel(code: string) { return code === 'unsure' ? 'Help me choose' : `${classes.find((choice) => choice[0] === code)?.[1] ?? code} (${code})`; }
function fieldId(path: string) { return path.startsWith('source') ? 'source' : path.startsWith('destination') ? 'destination' : path.replaceAll('.', '-'); }
function FieldError({ path, errors }: { path: string; errors: Errors }) {
  return errors[path] ? <p className="error" id={`${fieldId(path)}-error`}>{errors[path]}</p> : null;
}

export function BookingRequestForm() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmed, setConfirmed] = useState(false);
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [draftNoticeDismissed, setDraftNoticeDismissed] = useState(false);
  const [savedDraft, setSavedDraft] = useState<SavedDraft | null>(null);
  const [storageError, setStorageError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState('');
  const [sending, setSending] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const [previewFinished, setPreviewFinished] = useState(false);
  const pendingPayload = useRef<CustomerBookingRequest>();
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = !!requestId;

  useEffect(() => {
    setToday(getIndiaToday());
    const refresh = window.setInterval(() => setToday(getIndiaToday()), 60_000);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const result = savedDraftSchema.safeParse(JSON.parse(stored));
        if (result.success) setSavedDraft(result.data);
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch { setStorageError('This browser cannot save a draft. You can still fill in the form.'); }
    setHydrated(true);
    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (!hydrated || !saveOnDevice || receipt) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, draft, requestId })); }
    catch { setStorageError('The draft could not be saved on this device. Keep this page open while you finish.'); }
  }, [draft, hydrated, saveOnDevice, requestId, receipt]);

  useEffect(() => {
    if (!requestId || receipt) return;
    const keepRetry = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', keepRetry);
    return () => window.removeEventListener('beforeunload', keepRetry);
  }, [requestId, receipt]);

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    if (locked) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setConfirmed(false);
    setErrors({});
    setDeliveryError('');
  }
  function updatePassenger(index: number, field: keyof Traveller, value: string) {
    update('passengers', draft.passengers.map((person, personIndex) => personIndex === index ? { ...person, [field]: value, ...(field === 'age' ? { berthChoice: '' as const } : {}) } : person));
  }
  function payload() {
    return {
      schemaVersion: 1 as const, source: { code: draft.source }, destination: { code: draft.destination }, journeyDate: draft.journeyDate,
      classPreference: draft.classPreference, bookingTypePreference: draft.bookingTypePreference,
      trainPreference: draft.trainPreference, upgradePreferred: draft.upgradeChoice === 'yes', remarks: draft.remarks,
      contact: { name: draft.contactName, phone: draft.phone },
      passengers: draft.passengers.map((person) => ({ name: person.name, age: /^\d{1,3}$/.test(person.age) ? Number(person.age) : Number.NaN, gender: person.gender, ...(person.berthChoice ? { berthRequired: person.berthChoice === 'yes' } : {}) })),
      customerConfirmed: true as const,
    };
  }
  function focusError(path: string) {
    const firstField = path.split('.')[0];
    if (firstField === 'passengers' || firstField === 'contact') setStep(1);
    else if (firstField !== 'customerConfirmed') setStep(0);
    window.setTimeout(() => document.getElementById(fieldId(path))?.focus(), 0);
  }
  function validate(currentStep: number, all = false) {
    // A lost response must remain recoverable after the boarding date passes.
    // The server checks whether the same UUID was already received before
    // accepting a past date; new requests still require a current date.
    const schema = requestId ? customerBookingRequestSnapshotSchema : customerBookingRequestSchema;
    const result = schema.safeParse(payload());
    const nextErrors: Errors = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        const journeyField = ['source', 'destination', 'journeyDate', 'classPreference', 'bookingTypePreference', 'trainPreference', 'upgradePreferred', 'remarks'].includes(String(issue.path[0]));
        if (all || (currentStep === 0 && journeyField) || (currentStep === 1 && !journeyField)) nextErrors[path] ??= issue.message;
      }
    }
    if ((all || currentStep === 2) && !confirmed) nextErrors.customerConfirmed = 'Please check your details and tick the confirmation before sending.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const firstPath = Object.keys(nextErrors)[0];
      focusError(firstPath);
      return null;
    }
    return result.success ? result.data : true;
  }
  function goTo(nextStep: number) {
    setStep(nextStep);
    setErrors({});
    window.setTimeout(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 0);
  }
  function next() { if (validate(step)) goTo(step + 1); }
  function clearSavedDraft() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* An unavailable storage does not block the form. */ }
    setSavedDraft(null);
    setSaveOnDevice(false);
  }
  function restoreDraft() {
    if (!savedDraft) return;
    setDraft(savedDraft.draft);
    setRequestId(savedDraft.requestId);
    setSaveOnDevice(true);
    setSavedDraft(null);
    setConfirmed(false);
    goTo(savedDraft.requestId ? 2 : 0);
  }
  async function send() {
    if (sending) return;
    const validated = validate(2, true);
    if (!validated || validated === true) return;
    if (previewEnabled) { setPreviewFinished(true); return; }
    if (!isConfigured) { setDeliveryError('Online requests are not available yet. Please contact your booking agent.'); return; }
    setSending(true);
    setDeliveryError('');
    try {
      const id = requestId ?? window.crypto.randomUUID();
      setRequestId(id);
      pendingPayload.current ??= validated;
      const result = await sendBookingRequest(id, pendingPayload.current);
      setReceipt(result.receiptReference);
      clearSavedDraft();
      setDraft(emptyDraft());
      pendingPayload.current = undefined;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) { setDeliveryError(submissionError(error)); }
    finally { setSending(false); }
  }

  const hasInfant = draft.passengers.some((person) => /^\d+$/.test(person.age) && Number(person.age) < 5);
  const duplicateNames = draft.passengers.some((person, index) => person.name.trim().length > 0 && draft.passengers.some((other, otherIndex) => index !== otherIndex && other.name.trim().toLowerCase() === person.name.trim().toLowerCase()));

  return <div className="min-h-screen">
    <header className="border-b border-[#dce5dd] bg-white/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <a className="flex items-center gap-2.5 font-bold tracking-tight" href="./" aria-label="TrainTrack customer requests">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white"><TrainFront className="h-5 w-5" /></span><span className="text-lg">TrainTrack<span className="text-[#748a7b]">.</span></span>
        </a>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Booking requests</span>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-8 sm:pt-12">
      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:pt-4">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e7efe7] px-3 py-1.5 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />LET’S GET YOU ON YOUR WAY</div>
          <h1 className="max-w-sm text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">A smoother start<br className="hidden lg:block" /> to your journey.</h1>
          <p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">Tell us where you’re going and who’s travelling. Your booking agent will take it from there.</p>
          <div className="mt-7 hidden space-y-5 lg:block">
            {[{ icon: Clock3, title: 'A few easy steps', body: 'No signup. No copying templates.' }, { icon: CheckCircle2, title: 'You check the details', body: 'One clear summary before you send.' }, { icon: HeartHandshake, title: 'A person reviews it', body: 'Your agent confirms before booking.' }].map(({ icon: Icon, title, body }) => <div className="flex gap-3" key={title}><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary"><Icon className="h-4 w-4" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p></div></div>)}
          </div>
          <div className="mt-8 hidden rounded-2xl border border-[#d8e3d8] p-5 lg:block"><TrainFront className="mb-3 h-8 w-8 text-primary" aria-hidden="true" /><p className="text-sm font-semibold">Good journeys start with the right details.</p><p className="mt-2 text-xs leading-6 text-muted-foreground">This form sends a request to your booking agent. It does not reserve a seat or issue a ticket.</p></div>
        </aside>

        <div className="min-w-0">
          {previewEnabled && <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Local preview.</strong> Explore the form with your own test details. Nothing is sent or saved to the booking system.</div>}
          {!previewEnabled && !isConfigured && <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Online requests are not open yet.</strong> You can explore the form, but sending is unavailable. Please contact your booking agent for a booking.</div>}

          {receipt ? <section className="form-panel py-10 text-center" aria-live="polite">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary"><CheckCircle2 className="h-8 w-8" /></span>
            <p className="section-eyebrow mt-6">REQUEST RECEIVED</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">You’ve done your part.</h2>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-muted-foreground">Your booking agent will review your details and contact you if anything needs checking.</p>
            <div className="mx-auto mt-6 max-w-sm rounded-xl border border-dashed border-primary/40 bg-secondary p-4"><p className="text-xs text-muted-foreground">Your request reference</p><p className="mt-1 break-all text-lg font-bold tracking-wider">{receipt}</p></div>
            <p className="mx-auto mt-6 max-w-sm text-sm font-semibold">This is a request receipt. Your train ticket is not booked yet.</p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-6 text-muted-foreground">Keep a screenshot of this reference. To change any details, tell your booking agent and share this reference.</p>
          </section> : previewFinished ? <section className="form-panel py-10 text-center" aria-live="polite"><FileCheck2 className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-5 text-2xl font-semibold">Preview complete</h2><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">This was a local demonstration. No request was delivered, no booking was created, and there is no request receipt.</p><Button type="button" className="mt-6" onClick={() => setPreviewFinished(false)}>Back to your preview</Button></section> : <>
            <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Form progress">
              {steps.map(({ name, icon: Icon }, index) => <li key={name} aria-current={index === step ? 'step' : undefined} className={`flex items-center gap-2 rounded-xl px-2 py-3 sm:px-4 ${index === step ? 'bg-primary text-white' : index < step ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === step ? 'bg-white/20' : 'border border-current/20'}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                <span className="text-xs font-semibold sm:text-sm">{name}</span><Icon className="ml-auto hidden h-4 w-4 xl:block" aria-hidden="true" />
              </li>)}
            </ol>

            {savedDraft && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-secondary p-4" role="status"><p className="mr-auto text-sm">There’s a draft saved on this device.</p><Button type="button" size="sm" onClick={restoreDraft}>Resume draft</Button><Button type="button" size="sm" variant="ghost" onClick={clearSavedDraft}>Delete draft</Button></div>}
            <form className="form-panel" noValidate onSubmit={(event) => { event.preventDefault(); if (step < 2) next(); else void send(); }}>
              <div className="mb-7 flex items-start justify-between gap-3"><div><p className="section-eyebrow">STEP {step + 1} OF 3</p><h2 ref={heading} tabIndex={-1} className="mt-2 scroll-mt-8 text-2xl font-semibold tracking-tight outline-none">{step === 0 ? 'Where are we heading?' : step === 1 ? 'Who’s coming along?' : 'One last look.'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{step === 0 ? 'Choose your exact stations and the date you’ll board.' : step === 1 ? 'Careful details now make booking much easier.' : 'Check each name, station and date before sending.'}</p></div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">{step === 0 ? <MapPin className="h-5 w-5" /> : step === 1 ? <Users className="h-5 w-5" /> : <FileCheck2 className="h-5 w-5" />}</span></div>

              {Object.keys(errors).length > 0 && <div role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm text-destructive"><p className="font-semibold">A few details need your attention.</p><ul className="mt-2 space-y-1">{Object.entries(errors).map(([path, message]) => <li key={path}><button type="button" className="text-left underline underline-offset-2" onClick={() => focusError(path)}>{message}</button></li>)}</ul></div>}

              {step === 0 && <>
                <section className="form-section">
                  <div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                    <StationPicker id="source" label="Leaving from" code={draft.source} onChange={(code) => update('source', code)} error={errors.source ?? errors['source.code']} disabled={locked} />
                    <button className="mx-auto -my-2 flex h-9 w-9 items-center justify-center rounded-full border bg-background text-primary sm:mt-8" type="button" disabled={locked || !draft.source || !draft.destination} aria-label="Swap departure and destination stations" onClick={() => { if (!locked) { setDraft((current) => ({ ...current, source: current.destination, destination: current.source })); setConfirmed(false); setErrors({}); } }}><ArrowUpDown className="h-4 w-4" /></button>
                    <StationPicker id="destination" label="Going to" code={draft.destination} onChange={(code) => update('destination', code)} error={errors.destination ?? errors['destination.code']} disabled={locked} />
                  </div>
                  <div className="mt-6"><label className="field-label" htmlFor="journeyDate">Which date will you board the train?</label><div className="relative"><Input type="date" id="journeyDate" className="field" min={today || undefined} max="2099-12-31" value={draft.journeyDate} disabled={locked} aria-invalid={!!errors.journeyDate} aria-describedby={`journeyDate-hint${errors.journeyDate ? ' journeyDate-error' : ''}`} onChange={(event) => update('journeyDate', event.target.value)} /></div><p id="journeyDate-hint" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" aria-hidden="true" />{draft.journeyDate ? fullDate(draft.journeyDate) : 'Use the date you board at your chosen departure station.'}</p><FieldError path="journeyDate" errors={errors} /></div>
                </section>

                <section className="form-section"><fieldset id="classPreference" tabIndex={-1} aria-describedby={errors.classPreference ? 'classPreference-error' : undefined}><legend className="field-label">How would you like to travel?</legend><div className="grid gap-2.5 sm:grid-cols-2">{classes.map(([code, label, help]) => <label className="choice" key={code}><input type="radio" name="travel-class" value={code} checked={draft.classPreference === code} disabled={locked} onChange={() => update('classPreference', code)} /><span><span className="text-sm font-semibold">{label} <span className="ml-1 text-xs font-normal text-muted-foreground">{code}</span></span><span className="mt-0.5 block text-xs text-muted-foreground">{help}</span></span></label>)}<label className="choice"><input type="radio" name="travel-class" value="unsure" checked={draft.classPreference === 'unsure'} disabled={locked} onChange={() => update('classPreference', 'unsure')} /><span><span className="text-sm font-semibold">Help me choose</span><span className="mt-0.5 block text-xs text-muted-foreground">My agent can explain the options.</span></span></label></div><FieldError path="classPreference" errors={errors} /></fieldset></section>
                <section className="form-section"><fieldset id="bookingTypePreference" tabIndex={-1} aria-describedby={errors.bookingTypePreference ? 'bookingTypePreference-error' : undefined}><legend className="field-label">Do you need a Tatkal booking?</legend><div className="flex flex-wrap gap-2">{[['General', 'Regular booking'], ['Tatkal', 'Tatkal'], ['unsure', 'Not sure']].map(([value, label]) => <label className="choice flex-1" key={value}><input type="radio" name="booking-type" value={value} checked={draft.bookingTypePreference === value} disabled={locked} onChange={() => update('bookingTypePreference', value)} /><span className="whitespace-nowrap text-sm">{label}</span></label>)}</div><FieldError path="bookingTypePreference" errors={errors} /></fieldset></section>
                <section className="form-section"><label className="field-label" htmlFor="trainPreference">A particular train in mind? <span className="font-normal text-muted-foreground">Optional</span></label><Input id="trainPreference" className="field" value={draft.trainPreference} maxLength={160} disabled={locked} placeholder="Train name or number, if you know it" onChange={(event) => update('trainPreference', event.target.value)} /><FieldError path="trainPreference" errors={errors} /><p className="mt-2 text-xs leading-5 text-muted-foreground">Your agent will verify the train, route and boarding date.</p>
                  <fieldset className="mt-6"><legend className="field-label">If your chosen class is unavailable…</legend><div className="space-y-2"><label className="choice"><input type="radio" name="upgrade" checked={draft.upgradeChoice === 'no'} disabled={locked} onChange={() => update('upgradeChoice', 'no')} /><span className="text-sm">Please ask me before changing the class.</span></label><label className="choice"><input type="radio" name="upgrade" checked={draft.upgradeChoice === 'yes'} disabled={locked} onChange={() => update('upgradeChoice', 'yes')} /><span className="text-sm">I’m open to an upgrade. Confirm the fare with me first.</span></label></div></fieldset>
                  <div className="mt-6"><label className="field-label" htmlFor="remarks">Anything else we should know? <span className="font-normal text-muted-foreground">Optional</span></label><textarea id="remarks" rows={3} className="field resize-y" disabled={locked} value={draft.remarks} maxLength={1200} placeholder="Berth preferences, flexible dates, or when we should call you before booking…" onChange={(event) => update('remarks', event.target.value)} /><FieldError path="remarks" errors={errors} /><p className="mt-2 text-xs leading-5 text-muted-foreground">Preferences depend on availability. Do not share passwords, identity numbers or payment details.</p></div>
                </section>
              </>}

              {step === 1 && <>
                <div className="mb-5 flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-6 text-primary"><Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />Write each full name exactly as it appears on their identification. We won’t autocorrect names.</div>
                <section className="form-section space-y-4">{draft.passengers.map((person, index) => <div key={index} className="rounded-2xl border bg-[#fcfdfb] p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs text-primary">{index + 1}</span>Traveller {index + 1}</h3>{draft.passengers.length > 1 && <button type="button" disabled={locked} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove traveller ${index + 1}`} onClick={() => update('passengers', draft.passengers.filter((_, personIndex) => personIndex !== index))}><Trash2 className="h-4 w-4" /></button>}</div>
                  <label className="field-label" htmlFor={`passengers-${index}-name`}>Full name as on identification</label><Input className="field" id={`passengers-${index}-name`} value={person.name} disabled={locked} maxLength={80} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="Enter the full name" aria-invalid={!!errors[`passengers.${index}.name`]} aria-describedby={errors[`passengers.${index}.name`] ? `passengers-${index}-name-error` : undefined} onChange={(event) => updatePassenger(index, 'name', event.target.value)} /><FieldError path={`passengers.${index}.name`} errors={errors} />
                  <div className="mt-4 grid grid-cols-[100px_1fr] gap-4 sm:grid-cols-[140px_1fr]"><div><label className="field-label" htmlFor={`passengers-${index}-age`}>Age</label><Input className="field" id={`passengers-${index}-age`} type="text" inputMode="numeric" value={person.age} disabled={locked} maxLength={3} placeholder="Years" aria-invalid={!!errors[`passengers.${index}.age`]} aria-describedby={errors[`passengers.${index}.age`] ? `passengers-${index}-age-error` : undefined} onChange={(event) => updatePassenger(index, 'age', event.target.value)} /><FieldError path={`passengers.${index}.age`} errors={errors} /></div><div><label className="field-label" htmlFor={`passengers-${index}-gender`}>Gender</label><select className="field" id={`passengers-${index}-gender`} value={person.gender} disabled={locked} aria-invalid={!!errors[`passengers.${index}.gender`]} aria-describedby={errors[`passengers.${index}.gender`] ? `passengers-${index}-gender-error` : undefined} onChange={(event) => updatePassenger(index, 'gender', event.target.value)}><option value="">Choose</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option></select><FieldError path={`passengers.${index}.gender`} errors={errors} /></div></div>
                  {/^[0-9]+$/.test(person.age) && Number(person.age) >= 5 && Number(person.age) <= 11 && <fieldset className="mt-4" id={`passengers-${index}-berthRequired`} tabIndex={-1}><legend className="field-label">Does this child need a separate seat or berth?</legend><div className="flex flex-wrap gap-2">{[['yes', 'Yes, a separate seat / berth'], ['no', 'No separate seat / berth']].map(([value, label]) => <label className="choice flex-1" key={value}><input type="radio" name={`child-berth-${index}`} checked={person.berthChoice === value} disabled={locked} onChange={() => updatePassenger(index, 'berthChoice', value)} /><span className="text-xs leading-5">{label}</span></label>)}</div><FieldError path={`passengers.${index}.berthRequired`} errors={errors} /><p className="mt-2 text-xs text-muted-foreground">This affects the fare. Your agent will check before booking.</p></fieldset>}
                  {/^[0-9]+$/.test(person.age) && Number(person.age) < 5 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-950">A child under 5 is travelling. Your agent must confirm their ticket and seat / berth requirements with you before booking.</p>}
                </div>)}
                  {duplicateNames && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-950">Two travellers have the same name. Please check that a traveller hasn’t been entered twice.</p>}
                  {draft.passengers.length < 6 ? <Button variant="outline" type="button" className="w-full border-dashed" disabled={locked} onClick={() => update('passengers', [...draft.passengers, emptyTraveller()])}><Plus className="h-4 w-4" />Add another traveller</Button> : <p className="text-xs text-muted-foreground">For more than 6 travellers, contact your booking agent to arrange the group.</p>}
                </section>
                <section className="form-section"><h3 className="mb-1 text-lg font-semibold">How can your agent reach you?</h3><p className="mb-5 text-xs leading-6 text-muted-foreground">Use the number you normally use to speak with your booking agent.</p><div className="grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="contact-name">Your name</label><Input className="field" id="contact-name" autoComplete="name" value={draft.contactName} maxLength={80} disabled={locked} aria-invalid={!!errors['contact.name']} aria-describedby={errors['contact.name'] ? 'contact-name-error' : undefined} onChange={(event) => update('contactName', event.target.value)} /><FieldError path="contact.name" errors={errors} /></div><div><label className="field-label" htmlFor="contact-phone">Indian mobile number</label><Input className="field" type="tel" inputMode="tel" id="contact-phone" autoComplete="tel" placeholder="10-digit mobile number" value={draft.phone} disabled={locked} maxLength={30} aria-invalid={!!errors['contact.phone']} aria-describedby={errors['contact.phone'] ? 'contact-phone-error' : undefined} onChange={(event) => update('phone', event.target.value)} /><FieldError path="contact.phone" errors={errors} /></div></div></section>
              </>}

              {step === 2 && <>
                <section className="form-section"><div className="mb-4 flex items-center justify-between gap-4"><h3 className="text-sm font-semibold">Your journey</h3><button type="button" className="text-xs font-semibold text-primary underline underline-offset-4 disabled:opacity-40" disabled={locked} onClick={() => goTo(0)}>Edit journey</button></div><div className="rounded-2xl bg-secondary p-4 sm:p-5"><div className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-semibold">{stationName(draft.source)}</p><ArrowRight className="my-2 h-4 w-4 text-primary" aria-hidden="true" /><p className="font-semibold">{stationName(draft.destination)}</p></div></div><p className="mt-4 border-t border-primary/15 pt-4 text-sm font-semibold">{fullDate(draft.journeyDate)}</p><p className="mt-1 text-xs text-muted-foreground">The date you board at {STATIONS.find((station) => station.code === draft.source)?.name}</p></div>
                  <dl className="mt-3"><div className="review-row"><dt>Travel class</dt><dd>{classLabel(draft.classPreference)}</dd></div><div className="review-row"><dt>Booking type</dt><dd>{draft.bookingTypePreference === 'unsure' ? 'Agent to advise' : draft.bookingTypePreference === 'General' ? 'Regular booking' : 'Tatkal'}</dd></div>{draft.trainPreference.trim() && <div className="review-row"><dt>Preferred train</dt><dd>{draft.trainPreference.trim()}</dd></div>}<div className="review-row"><dt>Upgrade permission</dt><dd>{draft.upgradeChoice === 'yes' ? 'Open to upgrade; confirm fare first' : 'Ask before changing class'}</dd></div>{draft.remarks.trim() && <div className="review-row"><dt>Preferences & conditions</dt><dd>{draft.remarks.trim()}</dd></div>}</dl>
                  {(draft.classPreference === 'unsure' || draft.bookingTypePreference === 'unsure') && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-950">Your agent will contact you to confirm the choices you’re unsure about before adding the booking.</p>}
                </section>
                <section className="form-section"><div className="mb-3 flex items-center justify-between gap-4"><h3 className="text-sm font-semibold">Travellers & contact</h3><button type="button" disabled={locked} className="text-xs font-semibold text-primary underline underline-offset-4 disabled:opacity-40" onClick={() => goTo(1)}>Edit travellers</button></div><ul className="divide-y rounded-xl border px-4">{draft.passengers.map((person, index) => <li className="py-4" key={index}><div className="flex items-start justify-between gap-3"><p className="break-words text-sm font-semibold">{person.name.trim()}</p><span className="shrink-0 rounded bg-secondary px-2 py-1 text-xs text-primary">{person.age} yrs · {person.gender === 'M' ? 'Male' : person.gender === 'F' ? 'Female' : 'Other'}</span></div>{Number(person.age) >= 5 && Number(person.age) <= 11 && <p className="mt-2 text-xs text-muted-foreground">{person.berthChoice === 'yes' ? 'Separate seat / berth requested' : 'No separate seat / berth requested'}</p>}{Number(person.age) < 5 && <p className="mt-2 text-xs text-amber-900">Under 5: agent to confirm ticket and seat / berth needs</p>}</li>)}</ul><dl className="mt-3"><div className="review-row"><dt>Contact name</dt><dd>{draft.contactName.trim()}</dd></div><div className="review-row"><dt>Mobile number</dt><dd>{draft.phone}</dd></div></dl>{hasInfant && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-950">Child under 5 details need an additional check with your agent. Sending this request does not confirm their seat or ticket.</p>}</section>
                <section className="form-section"><label className="choice items-start bg-secondary/50"><input className="mt-0.5" id="customerConfirmed" type="checkbox" checked={confirmed} disabled={sending} aria-invalid={!!errors.customerConfirmed} aria-describedby="confirmation-hint" onChange={(event) => { setConfirmed(event.target.checked); setErrors({}); }} /><span><span className="block text-sm font-semibold">I checked the stations, boarding date and every traveller’s details.</span><span id="confirmation-hint" className="mt-2 block text-xs leading-6 text-muted-foreground">I agree to share these details with my booking agent for this request and understand that a ticket has not been booked.</span></span></label><FieldError path="customerConfirmed" errors={errors} /></section>
              </>}

              {deliveryError && <div role="alert" className="mt-6 rounded-xl border border-destructive/25 bg-red-50 p-4 text-sm leading-6 text-destructive">{deliveryError}{requestId && <p className="mt-2 text-xs">Keep this page open to retry. The details are locked so your retry sends the same request.</p>}</div>}
              <div className="mt-7 flex items-center gap-3 border-t pt-6">{step > 0 && <Button type="button" variant="ghost" className="px-3" disabled={locked || sending} onClick={() => goTo(step - 1)}><ArrowLeft className="h-4 w-4" />Back</Button>}<Button type="submit" size="lg" className="ml-auto min-w-[180px]" disabled={sending || (step === 2 && !isConfigured && !previewEnabled)}>{sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : step < 2 ? <>Continue<ArrowRight className="h-4 w-4" /></> : previewEnabled ? <>Finish local preview<ChevronRight className="h-4 w-4" /></> : requestId ? <>Retry request<ArrowRight className="h-4 w-4" /></> : <>Send my request<ArrowRight className="h-4 w-4" /></>}</Button></div>
              {step === 2 && <p className="mt-4 text-center text-xs leading-6 text-muted-foreground">Your agent will review this request before creating a booking.</p>}
            </form>

            {!draftNoticeDismissed && <div className="relative mt-4 rounded-xl border bg-white/60 p-4 pr-10"><button className="absolute right-2 top-2 rounded p-2 text-muted-foreground" type="button" aria-label="Dismiss draft reminder" onClick={() => { clearSavedDraft(); setDraftNoticeDismissed(true); }}><X className="h-4 w-4" /></button><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#245e4c]" checked={saveOnDevice} onChange={(event) => { if (event.target.checked) { setSaveOnDevice(true); setSavedDraft(null); } else clearSavedDraft(); }} /><span><span className="block text-xs font-semibold">Save my draft on this device</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Optional. It includes traveller names and contact details. Leave this off on a shared device. We delete it after your request is received.</span></span></label>{saveOnDevice && <button type="button" className="ml-7 mt-2 text-xs font-semibold text-primary underline underline-offset-4" onClick={clearSavedDraft}>Delete saved draft</button>}</div>}
            {storageError && <p role="status" className="mt-3 text-xs text-muted-foreground">{storageError}</p>}
          </>}
          <p className="mt-6 flex items-start justify-center gap-2 text-center text-xs leading-6 text-muted-foreground"><LockKeyhole className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Please don’t enter identity numbers, passwords or bank details.</p>
        </div>
      </div>
    </main>
    <footer className="border-t py-5 text-center text-xs text-muted-foreground">Thoughtful details. Better journeys. <span className="mx-2 text-[#b9c8bb]">/</span> TrainTrack</footer>
  </div>;
}


