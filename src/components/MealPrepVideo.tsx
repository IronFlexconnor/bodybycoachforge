import { useEffect, useRef, useState } from "react";
import { PlayCircle, RefreshCcw, Loader2, Sparkles } from "lucide-react";
import { videoForRecipe, nextVideoForRecipe, type MealVideoMeta } from "@/lib/mealVideos";

type RecipeLike = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  meal_type?: string | null;
  dietary_tags?: string[] | null;
  cuisine?: string | null;
};

type Props = {
  recipe: RecipeLike;
  title: string;
  /** Hero (lg), in-card (md), or compact list view (sm) for faster browsing. */
  size?: "lg" | "md" | "sm";
  /** Eager-load the thumbnail (above-the-fold). */
  priority?: boolean;
  /** Optional duration label, e.g. "12 min". */
  durationLabel?: string;
  /** Optional category label, e.g. "Lunch". */
  categoryLabel?: string;
};

/**
 * Premium meal-prep video block — tuned for smooth mobile scroll:
 *  - Iframe is NEVER mounted until (a) the card is in view AND (b) the user
 *    taps play. This avoids YouTube's heavy player + network work during scroll.
 *  - Thumbnail itself only decodes once the card is near the viewport
 *    (IntersectionObserver w/ generous rootMargin), keeping offscreen cards
 *    from competing for the main thread.
 *  - Skeleton/shimmer use cheap CSS (no animate-pulse stacking, no blur on
 *    the base skeleton) — the regen overlay is the only briefly-animated layer.
 */
export function MealPrepVideo({
  recipe,
  title,
  size = "md",
  priority = false,
  durationLabel,
  categoryLabel,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [video, setVideo] = useState<MealVideoMeta>(() => videoForRecipe(recipe));
  const [playing, setPlaying] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [inView, setInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Sharp source first; fall back if maxres is missing.
  const maxThumb = `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;
  const hqThumb = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

  // Prefetch the *next* curated clip's thumbnail so a Regenerate tap feels instant.
  const nextVideo = nextVideoForRecipe(recipe, offset);
  const nextMaxThumb = `https://i.ytimg.com/vi/${nextVideo.id}/maxresdefault.jpg`;
  const nextHqThumb = `https://i.ytimg.com/vi/${nextVideo.id}/hqdefault.jpg`;

  useEffect(() => {
    setImgReady(false);
    setUsedFallback(false);
  }, [video.id]);

  // Defer thumbnail decode + iframe mount until near viewport.
  useEffect(() => {
    if (priority || inView) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "400px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [priority, inView]);

  const handleRegenerate = () => {
    if (regenerating) return;
    setRegenerating(true);
    setPlaying(false);
    setTimeout(() => {
      const nextOffset = offset + 1;
      const next = nextVideoForRecipe(recipe, offset);
      setOffset(nextOffset);
      setVideo(next);
      setRegenerating(false);
    }, 450);
  };

  const playBtnSize = size === "lg" ? "h-16 w-16" : "h-14 w-14";
  const playIconSize = size === "lg" ? "h-8 w-8" : "h-7 w-7";

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 shadow-card [content-visibility:auto] [contain-intrinsic-size:320px_240px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-primary/10 px-3 py-2 text-[11px] font-semibold text-primary">
        <span className="inline-flex items-center gap-1.5">
          <PlayCircle className="h-3.5 w-3.5" /> Meal-prep video
        </span>
        <a
          href={video.watchUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-semibold text-primary/80 underline-offset-2 hover:underline"
        >
          Open on YouTube
        </a>
      </div>

      {/* Stable aspect box prevents layout shift while scrolling */}
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {/* Lightweight skeleton — solid token, no pulse stacking */}
        <div
          className={`absolute inset-0 bg-surface ${
            imgReady ? "opacity-0" : "opacity-100"
          } transition-opacity duration-200`}
          aria-hidden
        />

        {playing && inView ? (
          <iframe
            key={video.id}
            src={`${video.embedUrl}&autoplay=1`}
            title={`${title} prep video — press the CC button in the player to turn on captions`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Play ${title} prep video`}
          >
            {inView && (
              <img
                ref={imgRef}
                key={video.id}
                src={maxThumb}
                srcSet={`${maxThumb} 1280w, ${hqThumb} 480w`}
                sizes={size === "lg" ? "(max-width: 768px) 100vw, 640px" : "(max-width: 768px) 100vw, 480px"}
                alt={`${title} prep video thumbnail`}
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={priority ? "high" : "auto"}
                onLoad={() => setImgReady(true)}
                onError={(e) => {
                  if (!usedFallback) {
                    setUsedFallback(true);
                    e.currentTarget.srcset = "";
                    e.currentTarget.src = hqThumb;
                  } else {
                    setImgReady(true);
                  }
                }}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  imgReady ? "opacity-100" : "opacity-0"
                } group-hover:scale-[1.02] motion-reduce:group-hover:scale-100`}
                style={{ willChange: "opacity" }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

            {/* Top-left chips */}
            <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
              {categoryLabel && (
                <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
                  {categoryLabel}
                </span>
              )}
              {durationLabel && (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md ring-1 ring-white/25">
                  {durationLabel}
                </span>
              )}
            </div>

            {/* Center play */}
            <div className="absolute inset-0 grid place-items-center">
              <div
                className={`grid ${playBtnSize} place-items-center rounded-full bg-primary/95 text-primary-foreground shadow-glow ring-4 ring-white/15 transition-transform group-hover:scale-110 motion-reduce:group-hover:scale-100`}
              >
                <PlayCircle className={playIconSize} />
              </div>
            </div>

            {/* Title */}
            <div className="absolute bottom-3 left-3 right-3 text-left">
              <div className="text-sm font-bold leading-tight text-white drop-shadow line-clamp-2">
                {title}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-white/85 drop-shadow line-clamp-1">
                {video.title}
              </div>
            </div>
          </button>
        )}

        {/* Prefetch next clip's thumbnail (hidden) once the card is in view */}
        {inView && (
          <img
            src={nextMaxThumb}
            srcSet={`${nextMaxThumb} 1280w, ${nextHqThumb} 480w`}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            width={1}
            height={1}
            className="pointer-events-none absolute h-px w-px opacity-0"
          />
        )}

        {/* Regenerating overlay — single lightweight animated layer */}
        {regenerating && (
          <div className="absolute inset-0 grid place-items-center bg-black/55">
            <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-surface/90 px-3 py-1.5 text-xs font-semibold text-primary shadow-glow">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding a fresher clip…
            </div>
          </div>
        )}
      </div>

      {/* Premium action row */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          Tap to autoplay · curated by Coach Forge
        </p>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="group inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10 px-3 py-1.5 text-[11px] font-semibold text-primary shadow-sm transition hover:border-primary/60 hover:from-primary/20 hover:to-accent/20 disabled:opacity-60"
          aria-label="Regenerate prep video"
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5 transition-transform group-hover:-rotate-180 duration-500 motion-reduce:group-hover:rotate-0" />
          )}
          <span>Regenerate</span>
          <Sparkles className="h-3 w-3 opacity-70" />
        </button>
      </div>
    </div>
  );
}
