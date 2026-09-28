"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, ArrowRight, ArrowLeft, Zap, Film, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DirectionAwareHover } from "@/components/ui/card";
import { MovieLoader } from "@/components/ui/loader";
import { MovieModal } from "@/components/features/movie-modal";
import { api } from "@/services/api";
import { enrichWithPosters, getCachedPoster } from "@/lib/image-util";

const MOODS = ["Happy", "Dark", "Adrenaline", "Mind-Bending", "Romantic", "Scary"];
const GENRES = ["Action", "Sci-Fi", "Comedy", "Romance", "Horror", "Anime", "Drama", "Thriller"];
const FILTER_TYPES = ["All", "Movie", "Anime"];

export default function CineMatchHybrid() {
  const [mode, setMode] = useState<"search" | "wizard">("search");
  const [selectedResult, setSelectedResult] = useState<any>(null);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-black selection:text-white pb-10">
      <nav className="w-full max-w-7xl mx-auto p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4 z-50">
        <h1 className="text-2xl font-black tracking-tighter flex items-center gap-1.5 cursor-pointer" onClick={() => window.location.reload()}>
          CineMatch.
        </h1>
        <div className="flex bg-zinc-100 p-1 rounded-full border border-zinc-200">
            <button onClick={() => setMode("search")} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${mode === 'search' ? 'bg-white shadow-sm text-black' : 'text-zinc-500 hover:text-black'}`}>
                <Search size={14}/> Search
            </button>
            <button onClick={() => setMode("wizard")} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${mode === 'wizard' ? 'bg-black shadow-sm text-white' : 'text-zinc-500 hover:text-black'}`}>
                <Sparkles size={14}/> Concierge
            </button>
        </div>
      </nav>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6">
          {mode === "search" ? <SearchMode onSelect={setSelectedResult} onSwitchToWizard={() => setMode("wizard")} /> : <WizardMode onSelect={setSelectedResult} />}
      </div>

      <MovieModal isOpen={!!selectedResult} movie={selectedResult} onClose={() => setSelectedResult(null)} />
    </main>
  );
}

const SUGGESTIONS = [
    "Cyberpunk Anime",
    "Mind-Bending Sci-Fi",
    "Dark Noir Thriller",
    "Feel-Good 90s Comedy",
    "Studio Ghibli"
];

function SearchMode({ onSelect, onSwitchToWizard }: { onSelect: (m: any) => void; onSwitchToWizard?: () => void }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const lastQueryRef = useRef("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const performSearch = async (q: string) => {
        const clean = q.trim();
        if (!clean) {
            setResults([]);
            setHasSearched(false);
            return;
        }

        lastQueryRef.current = clean;
        setResults([]); // Clear results immediately so MovieLoader renders
        setLoading(true);
        setHasSearched(true);

        try {
            // Guarantee at least 650ms display duration for smooth loader animation
            const minAnimationDelay = new Promise(r => setTimeout(r, 650));
            const [data] = await Promise.all([
                api.search(clean),
                minAnimationDelay
            ]);

            // Enrich all items with posters before turning off loader so cards never flash placeholders
            const enriched = await enrichWithPosters(data.results || []);

            // Only update if this request matches current query
            if (lastQueryRef.current === clean) {
                setResults(enriched);
                setLoading(false);
            }
        } catch (e) {
            console.error("Search failed:", e);
            setLoading(false);
        }
    };

    const handleSuggestionClick = (suggested: string) => {
        setQuery(suggested);
        performSearch(suggested);
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setQuery(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    };

    return (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center pt-8 md:pt-16">
            <h2 className="text-4xl md:text-7xl font-black mb-3 tracking-tighter text-center leading-tight">
                Find it fast.
            </h2>
            <p className="text-zinc-500 text-sm md:text-base mb-6 text-center max-w-lg">
                Hybrid AI: Instant exact title search + deep vibe semantic discovery.
            </p>
            
            <div className="w-full max-w-2xl relative mb-3 bg-white rounded-3xl border border-zinc-300 focus-within:border-black transition-colors shadow-sm overflow-hidden flex items-end">
                <textarea
                    ref={textareaRef}
                    placeholder="Type a movie title, character, or descriptive plot..." 
                    value={query} 
                    onChange={handleTextareaChange}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            performSearch(query);
                        }
                    }}
                    rows={1}
                    className="w-full py-4 pl-6 pr-24 text-lg bg-transparent outline-none resize-none min-h-[60px] max-h-[300px]"
                />
                <div className="absolute right-2 bottom-2">
                    <Button 
                        onClick={() => performSearch(query)} 
                        disabled={loading || !query.trim()}
                        className="px-5 py-5 font-bold rounded-2xl"
                    >
                        Go
                    </Button>
                </div>
            </div>

            {/* Quick Suggested Queries */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-10 max-w-2xl text-xs text-zinc-500">
                <span className="font-semibold text-zinc-400 mr-1">Try:</span>
                {SUGGESTIONS.map(s => (
                    <button
                        key={s}
                        onClick={() => handleSuggestionClick(s)}
                        className="px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition text-xs font-medium cursor-pointer"
                    >
                        {s}
                    </button>
                ))}
            </div>

            {loading && <MovieLoader />}

            {!loading && hasSearched && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md">
                    <p className="text-xl font-bold mb-2">No matching titles found</p>
                    <p className="text-sm text-zinc-500 mb-6">
                        We couldn't find a direct match for "{lastQueryRef.current}". Try searching for themes, mood keywords, or let our Concierge curate a vibe for you.
                    </p>
                    {onSwitchToWizard && (
                        <Button onClick={onSwitchToWizard} className="gap-2">
                            <Sparkles size={16} /> Open Concierge
                        </Button>
                    )}
                </div>
            )}

            {!loading && results.length > 0 && (
                 <div className="grid grid-cols-1 place-items-center sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full">
                    {results.map((item) => (
                        <div key={item.id} onClick={() => onSelect(item)} className="cursor-pointer w-full">
                            <DirectionAwareHover imageUrl={item.poster || "/poster-placeholder.jpg"}>
                                <div className="space-y-1">
                                    <p className="font-bold text-lg leading-tight line-clamp-2">{item.title}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-300">
                                        <span className="font-semibold">{item.type}</span>
                                        <span>•</span>
                                        <span>⭐ {item.rating?.toFixed(1) || "N/A"}</span>
                                        {item.score !== undefined && (
                                            <>
                                                <span>•</span>
                                                <span className="text-emerald-400 font-mono">
                                                    {item.score >= 1.0 ? "Exact Match" : `${Math.round((item.score || 0) * 100)}% Match`}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </DirectionAwareHover>
                        </div>
                    ))}
                 </div>
            )}
        </motion.div>
    );
}

function WizardMode({ onSelect }: { onSelect: (m: any) => void }) {
    const [step, setStep] = useState<"intro" | "genre" | "select" | "loading" | "results">("intro");
    const [mood, setMood] = useState("");
    const [genre, setGenre] = useState("");
    const [selectedMovies, setSelectedMovies] = useState<string[]>([]);
    const [selectionItems, setSelectionItems] = useState<any[]>([]);
    const [results, setResults] = useState<any[]>([]);

    const handleGenreSelect = async (g: string) => {
        setGenre(g);
        setStep("loading");
        try {
            const data = await api.getQuizItems(g);
            const enriched = await enrichWithPosters(data.items || []);
            setSelectionItems(enriched);
            setStep("select");
        } catch (e) {
            console.error(e);
            setStep("genre");
        }
    };

    const handleGetResults = async () => {
        setStep("loading");
        try {
            const data = await api.getHybridRecommendations(mood, genre, selectedMovies);
            const enriched = await enrichWithPosters(data.results || []);
            setResults(enriched);
            setStep("results");
        } catch (e) {
            console.error(e);
            setStep("select");
        }
    };

    const toggleSelection = (t: string) => {
        if(selectedMovies.includes(t)) setSelectedMovies(p => p.filter(x => x !== t));
        else if(selectedMovies.length < 5) setSelectedMovies(p => [...p, t]);
    };

    return (
        <div className="w-full pt-6 md:pt-10">
            <AnimatePresence mode="wait">
                {step === 'intro' && (
                    <motion.div key="intro" initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="max-w-xl mx-auto space-y-8 px-4">
                        <div className="text-center">
                            <h2 className="text-4xl md:text-5xl font-black mb-2">The Concierge.</h2>
                            <p className="text-zinc-500">Let us curate a playlist for your current vibe.</p>
                        </div>
                        <div className="space-y-6 bg-white p-6 md:p-8 rounded-2xl border border-zinc-100 shadow-xl shadow-zinc-200/50">
                            <div>
                                <Input label="Current Mood" value={mood} onChange={e => setMood(e.target.value)} />
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {MOODS.map(m => (
                                        <Badge key={m} variant="outline" className="cursor-pointer hover:bg-black hover:text-white transition" onClick={() => setMood(m)}>{m}</Badge>
                                    ))}
                                </div>
                            </div>
                            <Button className="w-full h-12 text-lg" disabled={!mood} onClick={() => setStep("genre")}>Start Curating <ArrowRight size={16}/></Button>
                        </div>
                    </motion.div>
                )}

                {step === 'genre' && (
                    <motion.div key="genre" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="text-center">
                         <Button variant="ghost" className="mb-8" onClick={() => setStep("intro")}><ArrowLeft size={14}/> Back</Button>
                         <h2 className="text-3xl md:text-4xl font-bold mb-8">Pick a Genre.</h2>
                         <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
                            {GENRES.map(g => (
                                <button key={g} onClick={() => handleGenreSelect(g)} className="w-full sm:w-auto px-8 py-6 rounded-xl border border-zinc-200 bg-white hover:border-black hover:shadow-lg transition-all text-xl font-bold">
                                    {g}
                                </button>
                            ))}
                         </div>
                    </motion.div>
                )}

                {step === 'loading' && <motion.div key="loading" exit={{opacity:0}}><MovieLoader /></motion.div>}

                {step === 'select' && (
                    <motion.div key="select" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="pb-20">
                        <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                            <div>
                                <h2 className="text-3xl font-bold">Refine your taste.</h2>
                                <p className="text-zinc-500">Select titles you enjoyed in {genre}.</p>
                            </div>
                            <Button onClick={handleGetResults} disabled={selectedMovies.length < 1} size="lg" className="w-full md:w-auto px-8">View Results <ArrowRight size={16}/></Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                            {selectionItems.map(item => {
                                const active = selectedMovies.includes(item.title);
                                return (
                                    <div key={item.id} onClick={() => toggleSelection(item.title)} className={`relative cursor-pointer transition-all ${active ? 'ring-4 ring-black rounded-lg scale-95' : 'hover:opacity-80'}`}>
                                        <img 
                                            src={item.poster || "/poster-placeholder.jpg"} 
                                            alt={item.title}
                                            className="rounded-lg aspect-[2/3] object-cover w-full h-full bg-zinc-200"
                                        />
                                        <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white text-xs font-semibold rounded-b-lg truncate">
                                            {item.title}
                                        </div>
                                        {active && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold rounded-lg">SELECTED</div>}
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}

                {step === 'results' && (
                    <motion.div key="results" initial={{opacity:0}} animate={{opacity:1}} className="pb-20">
                         <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-2xl md:text-3xl font-bold">Top Picks for You</h2>
                                <p className="text-sm text-zinc-500">{genre} • {mood}</p>
                            </div>
                            <Button variant="outline" onClick={() => setStep("intro")}>Start Over</Button>
                         </div>
                         <div className="grid grid-cols-1 place-items-center sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {results.map(item => (
                                <div key={item.id} onClick={() => onSelect(item)} className="cursor-pointer w-full">
                                    <DirectionAwareHover imageUrl={item.poster || "/poster-placeholder.jpg"}>
                                        <div className="space-y-1">
                                            <p className="font-bold text-xl leading-tight line-clamp-2">{item.title}</p>
                                            <p className="text-xs text-gray-300">Rating: ⭐ {item.rating?.toFixed(1) || "N/A"}</p>
                                            {item.reason && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{item.reason}</p>}
                                        </div>
                                    </DirectionAwareHover>
                                </div>
                            ))}
                         </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}