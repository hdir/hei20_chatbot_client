// HeiChatClientV3.jsx — the HEI 2.0 chat UI (the only client variant; v1/v2 were removed)
// TO DO
// Talefunksjon - Web Speech API (SpeechRecognition) for tale-til-tekst input
// Teste spørsmål med blanding av alvorlig spørsmål med ikke alvorlig. Hva besvares? Se regnearket
// x + button: fjerne teksten Eksempler på spørsmål
// ha et vindu som informerer bedre om anonymintet, hdir, trygge svar
// x tekseten i midten: mindre viktig dette av andre chatbot ikke kan svare, bruk heller teksten fra claude design forslaget
// x kanskje legge til bunnteksten fra eksisterende ?
// Excel i innkallingen
// harm svarene: få deler av svaret bygget opp med Hybrid
// harm svarene: Ta vekk følesesdelen i tilfelle Planning
// harm svarene: lage en katalog med tilbud som kan matches opp mot alvorlighetsgrad og response style, og la serveren velge det beste tilbudet basert på det den vet om brukeren og spørsmålet. Dette for å unngå at en bruker som stiller et alvorlig spørsmål får et svar i "vennlig" stil som ikke gir nok validering og støtte. Eller at en bruker som stiller et mindre alvorlig spørsmål får et kaldt, faktabasert svar uten noen validering.
// Hybrid: prioritere en artikkel i svaret (hvis relevans over en viss terskel) for å få mer kontekst og dybde i svaret, og for å kunne linke direkte til relevant artikkel. Dette kan også hjelpe med å gi mer informative svar på spørsmål som ikke er direkte bes

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Linking,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Animated,
    Keyboard,
    useWindowDimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { v4 as uuidv4 } from 'uuid';
import { useTheme } from './theme/ThemeContext';
import { ReactComponent as HdirLogo } from './assets/images/Hdir_logo.svg';
import Retning_1 from './assets/images/Retning_1.png';
import Retning_2 from './assets/images/Retning_2.png';
import Retning_3 from './assets/images/Retning_3.png';
import Retning_4 from './assets/images/Retning_4.png';
import Thumbs_up_light from './assets/images/Thumbs-up_light.png';
import Thumbs_up_dark from './assets/images/Thumbs-up_solid.png';
import Thumbs_down_light from './assets/images/Thumbs-down_light.png';
import Thumbs_down_dark from './assets/images/Thumbs-down_solid.png';
import sporsmaal_svar from './assets/images/Counseling-3--Streamline-Ultimate.png';



const TYPING_FRAMES = [Retning_1, Retning_2, Retning_3, Retning_4];

const isWeb = Platform.OS === 'web';




let webserverEndPoint = '';
if (process.env.NODE_ENV === 'development') {
    webserverEndPoint = 'http://localhost:80';
} else {
    webserverEndPoint =
        'https://helsesvar-chatbot-server-mini-cjavgqaaakbqhecn.westeurope-01.azurewebsites.net';
}


const INPUT_MIN_HEIGHT = 60;

// samme som i gamle klienten
const clientType = 'HEI';
const similarity_top_k = '5';
const similarity_cutoff = '0.75';
const claims_valid_threshold = '1.0';

// === A/B test config: retrieval backend ===
//
// vectorIndex picks which persisted index the main retriever loads:
//   "hvaerinnafor"          = article-only index
//   "hvaerinnafor_unified"  = articles + ung.no Q&A, cross-pollinated
//
//   art      → article-only retrieval (original behavior, pre-unified).
//   unified  → every query hits the unified index (cleanest A/B signal).
const RETRIEVAL_MODES = {
    art:     { label: 'Art', vectorIndex: 'hvaerinnafor'         },
    unified: { label: 'Hyb', vectorIndex: 'hvaerinnafor_unified' },
};
const DEFAULT_RETRIEVAL_MODE = 'unified';

// === A/B test config: response style ===
//
// Apply_response_style-noden på serveren omskriver det grounded svaret i én
// av fire stiler. Stilen velges normalt automatisk fra (severity, stance)
// — med 'auto' her sender vi ikke noe response_style-felt og lar serveren
// gjøre den utregningen. Pillene under lar oss tvinge en bestemt stil for
// A/B-testing og kvalitetsvurdering:
//
//   auto       → ingen override (server auto-router)
//   factual    → hopp over rewrite helt (rå grounded-svar)
//   warm       → lett normalisering, kunnskapsrik venn-tone
//   supportive → tydelig validering for affected_party (offer-perspektiv)
//   crisis     → direkte støtte først, ressurs tidlig, kort
//
// Auto er trygt i produksjon; å tvinge 'factual' på Red-spørsmål gir
// kalde svar på alvorlige situasjoner, så bruk overstyringene med vett.
const RESPONSE_STYLES = {
    auto:       { label: 'Auto',    value: null },
    factual:    { label: 'Fakta',   value: 'factual'    },
    warm:       { label: 'Vennlig', value: 'warm'       },
    supportive: { label: 'Støtte',  value: 'supportive' },
    crisis:     { label: 'Krise',   value: 'crisis'     },
};
const DEFAULT_RESPONSE_STYLE = 'auto';

const INDEX_GLOSSARY = {
    artikkel: {
        label: 'artikkel-indeksen',
        desc: 'ca 100 artikkelsider.',
    },
    qa: {
        label: 'spørsmål&svar-indeksen',
        desc: 'ca 9000 spørsmål&svar-par fra ung.no, indeksert separat for seg selv uten artikkeltekst.',
    },
    hybrid: {
        label: 'hybrid-indeksen',
        desc: 'består av artikkel-indeksen med ca 100 artikkelsider, indeksert sammen med ca 9000 spørsmål&svar-par fra ung.no, kryss-pollinert slik at hver artikkel er beriket med relaterte spørsmål&svar.',
    },
};

const chatId = uuidv4();
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const RELATED_PREFIXES = [
    "Jeg kan også svare på:",
    "Jeg svarer gjerne på mer:",
    "Trenger du svar på:",
    "Vil du vite mer om:",
];

// Temakortene genereres fra kategoriene serveren returnerer (/examples).
// Serveren gir kun tittel + spørsmål, så farger sykler gjennom denne paletten
// etter posisjon, og blurbs slås opp i denne tittel→blurb-tabellen.
// Legg til nye titler her hvis et kort vises uten blurb.
const TOPIC_PALETTE = ['#E1EFE3', '#FEEEDB', '#EDE5F3', '#D6E7E9'];
const TOPIC_BLURBS = {
    'Prevensjon': 'Velge prevensjon, bruke det riktig, og hva som finnes.',
    'Sex og helse': 'Kjønnssykdommer, testing og vaksiner.',
    'Grenser og samtykke': 'Si nei, høre nei, og forstå hva samtykke betyr.',
    'Hvis noe ikke føles trygt': 'Overgrep, vold, og hvor du finner hjelp.',
    'Kroppen din': 'Pubertet, menstruasjon, og din egen kropp.',
    'Følelser og forelskelse': 'Forelskelse, forhold, og kjærlighetssorg.',
    'Spørsmål om sex': 'Lyst, identitet, onani og alt midt i mellom.',
};
const TOPICS_PER_PAGE = 4;

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function ThemedIcon({ source, color, style }) {
    const mask = `url(${source})`;
    return (
        <View
            style={[
                {
                    backgroundColor: color,
                    WebkitMaskImage: mask,
                    maskImage: mask,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                },
                style,
            ]}
        />
    );
}

function ExpandIconSvg({ color, size = 32, strokeWidth = 1.5 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
        >
            <circle cx="16" cy="16" r="13" />
            <line x1="16" y1="10" x2="16" y2="22" />
            <line x1="10" y1="16" x2="22" y2="16" />
        </svg>
    );
}

function LinksIconSvg({ color, size = 32, strokeWidth = 1.5 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="16" cy="16" r="13" />
            <g transform="translate(8.2 8.2) scale(0.65)">
                <path
                    d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                    vectorEffect="non-scaling-stroke"
                />
                <path
                    d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                    vectorEffect="non-scaling-stroke"
                />
            </g>
        </svg>
    );
}

function SlidersIconSvg({ color, size = 16, strokeWidth = 1.6 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="3" y1="8" x2="21" y2="8" />
            <line x1="3" y1="16" x2="21" y2="16" />
            <circle cx="9" cy="8" r="2.4" fill={color} />
            <circle cx="16" cy="16" r="2.4" fill={color} />
        </svg>
    );
}

function InfoIconSvg({ color, size = 28, strokeWidth = 1.5 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="16" cy="16" r="13" />
            <line x1="16" y1="14" x2="16" y2="22" />
            <circle cx="16" cy="10.5" r="0.6" fill={color} stroke={color} />
        </svg>
    );
}

function CloseIconSvg({ color, size = 32, strokeWidth = 1.5 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
        >
            <circle cx="16" cy="16" r="13" />
            <line x1="11" y1="11" x2="21" y2="21" />
            <line x1="21" y1="11" x2="11" y2="21" />
        </svg>
    );
}

function EditIconSvg({ color, size = 18, strokeWidth = 1.6 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 20h4l10-10-4-4L4 16v4Z" />
            <line x1="14" y1="6" x2="18" y2="10" />
        </svg>
    );
}

function HamburgerIconSvg({ color, size = 22, strokeWidth = 1.7 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
        >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
    );
}

function ShieldLockIconSvg({ color, size = 16, strokeWidth = 1.6 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 3 L4 6 V12 C4 16.5 7.4 20.4 12 21 C16.6 20.4 20 16.5 20 12 V6 L12 3 Z" />
            <rect x="9.5" y="12" width="5" height="4.2" rx="0.7" />
            <path d="M10.5 12 V10.5 C10.5 9.67 11.17 9 12 9 C12.83 9 13.5 9.67 13.5 10.5 V12" />
        </svg>
    );
}

function ChevronSvg({ color, size = 16, strokeWidth = 1.8, direction = 'left' }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={direction === 'right' ? { transform: 'scaleX(-1)' } : undefined}
        >
            <polyline points="15 6 9 12 15 18" />
        </svg>
    );
}

function ArrowUpSvg({ color, backgroundColor, selected = false, size = 32, strokeWidth }) {
    if (selected) {
        const sw = strokeWidth ?? 1.8;
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 32 32"
            >
                <circle cx="16" cy="16" r="13" fill={color} />
                <g
                    fill="none"
                    stroke={backgroundColor}
                    strokeWidth={sw}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <line x1="16" y1="23" x2="16" y2="9" />
                    <polyline points="11,14 16,9 21,14" />
                </g>
            </svg>
        );
    }
    const sw = strokeWidth ?? 1.5;
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="16" cy="16" r="13" />
            <line x1="16" y1="23" x2="16" y2="9" />
            <polyline points="11,14 16,9 21,14" />
        </svg>
    );
}

export default function HeiChatClient() {
    const { theme, themeName, setThemeName, themes } = useTheme();
    const styles = useMemo(() => makeStyles(theme), [theme]);
    const markdownStyles = useMemo(() => makeMarkdownStyles(theme), [theme]);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const settingsSlideX = useRef(new Animated.Value(0)).current;

    // "Kildene mine" overlay: lists the source documents in the hvaerinnafor
    // index (served by /documents). Fetched lazily the first time it opens.
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [sourcesLoading, setSourcesLoading] = useState(false);
    const [sources, setSources] = useState([]);
    const [sourcesError, setSourcesError] = useState('');

    const openSettings = () => {
        setSettingsOpen(true);
        Animated.timing(settingsSlideX, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();
    };
    const closeSettings = () => {
        Animated.timing(settingsSlideX, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) setSettingsOpen(false);
        });
    };

    const [input, setInput] = useState('');
    const [textInputFocused, setTextInputFocused] = useState(false);
    const [promptHeight, setPromptHeight] = useState(INPUT_MIN_HEIGHT);

    // Active retrieval mode. Switching it changes the next request only;
    // already-rendered turns aren't re-fetched. Defined at module top — see
    // RETRIEVAL_MODES for the vectorIndex mapping.
    const [retrievalMode, setRetrievalMode] = useState(DEFAULT_RETRIEVAL_MODE);
    const [modeInfoOpen, setModeInfoOpen] = useState(false);
    // Whether the A/B controls panel (Retrieval + Stil rows) is expanded
    // above the input. Toggled by the inline "Modus" pill inside the input.
    const [controlsOpen, setControlsOpen] = useState(false);
    const [selectedTerm, setSelectedTerm] = useState(null);
    const toggleTerm = (term) => setSelectedTerm((cur) => (cur === term ? null : term));
    const { vectorIndex } = RETRIEVAL_MODES[retrievalMode];

    // Aktiv response_style. 'auto' = ingen override (server bestemmer).
    // Bare neste request leser den; allerede-rendrede turns beholder hva
    // de ble sendt med. Se RESPONSE_STYLES øverst i fila.
    const [responseStyleKey, setResponseStyleKey] = useState(DEFAULT_RESPONSE_STYLE);
    const responseStyleValue = RESPONSE_STYLES[responseStyleKey]?.value ?? null;

    const inputRef = useRef(null);

    const [loading, setLoading] = useState(false);

    const [turns, setTurns] = useState([]);
    const activeTurnIdRef = useRef(null);
    const abortRef = useRef(null);

    const [topicPage, setTopicPage] = useState(0);
    const [activeTopicId, setActiveTopicId] = useState(null);

    const refinedQueryRef = useRef('');
    const currentQueryRef = useRef('');
    const urlQueryRef = useRef('');

    const pendingQuestionRef = useRef(null);
    const shortAnswerRef = useRef('');

    const contentHRef = useRef(0);
    const layoutHRef = useRef(0);
    const scrollRef = useRef(null);
    const scrollRafRef = useRef(null);
    const turnYRef = useRef({});              // turnId -> y
    const pendingScrollToTurnRef = useRef(null);

    const [expandedSourcesById, setExpandedSourcesById] = useState({});
    const [expandedStatusById, setExpandedStatusById] = useState({});
    const [expandedSysInfoById, setExpandedSysInfoById] = useState({});
    const [feedbackByTurnId, setFeedbackByTurnId] = useState({});

    const [activeRelatedKey, setActiveRelatedKey] = useState(null);

    const { width } = useWindowDimensions();
    const isDesktopBrowser =
        Platform.OS === 'web' &&
        width >= 768 &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(pointer: fine)').matches; // true for mouse/trackpad

    const [examplesOpen, setExamplesOpen] = useState(false);
    const slideX = useRef(new Animated.Value(0)).current; // will set later

    // Server readiness. Backend exposes /healthz which returns
    //   { ready: bool, status: string, message?: string }
    // Indexes load asynchronously after the server starts accepting requests,
    // so until ready=true the chat/examples endpoints will reject with 503.
    // We poll until ready, then stop. `serverMessage` distinguishes the
    // "loading" message from a "cannot reach server" fallback.
    const [serverReady, setServerReady] = useState(true);
    const [serverMessage, setServerMessage] = useState(null);

    // Example data (edit as you like)
    const [exampleCategories, setExampleCategories] = useState([]);
    // [{id,title,items?:{ query: string, node_id?: string | null }[],loading?:boolean}]
    const [examplesLoading, setExamplesLoading] = useState(false);
    const examplesAbortRef = useRef(null);

    // Topic cards are derived from the server-provided categories. Colors cycle
    // through TOPIC_PALETTE by position; blurbs are looked up in TOPIC_BLURBS
    // by title (cards without a matching entry render without a blurb).
    const topicCards = exampleCategories.map((c, i) => ({
        id: c.id,
        title: c.title,
        blurb: TOPIC_BLURBS[c.title] || '',
        bg: TOPIC_PALETTE[i % TOPIC_PALETTE.length],
        items: Array.isArray(c.items) ? c.items : [],
    }));
    const totalTopicPages = Math.max(1, Math.ceil(topicCards.length / TOPICS_PER_PAGE));
    const visibleTopics = topicCards.slice(
        topicPage * TOPICS_PER_PAGE,
        (topicPage + 1) * TOPICS_PER_PAGE,
    );
    const activeTopic = topicCards.find((t) => t.id === activeTopicId) || null;

    const typewriterRef = useRef({}); // turnId -> { raf, targetShort, targetAnswer, iShort, iAnswer, lastTs }
    const TYPE_SPEED_CPS =400

    const cancelTypewriter = (turnId) => {
        const t = typewriterRef.current[turnId];
        if (t?.raf) cancelAnimationFrame(t.raf);
        delete typewriterRef.current[turnId];
    };

    const startTypewriter = (turnId, field /* 'shortAnswer' | 'answer' */, chunk) => {
        if (!turnId) return;
        if (chunk == null) return;            // allow empty string safely
        if (chunk === '') return;

        const tw = typewriterRef.current[turnId] ?? {
            raf: null,
            targetShort: '',
            targetAnswer: '',
            iShort: 0,
            iAnswer: 0,
            lastTs: 0,
            activeField: null,
        };

        // ✅ append to target, do NOT reset i*
        if (field === 'shortAnswer') {
            tw.targetShort += chunk;
            patchTurn(turnId, { typingShort: true });
        } else {
            tw.targetAnswer += chunk;
            patchTurn(turnId, { typingAnswer: true });
        }

        typewriterRef.current[turnId] = tw;

        // already running → just let it keep going
        if (tw.raf) return;

        const step = (ts) => {
            const t = typewriterRef.current[turnId];
            if (!t) return;

            if (!t.lastTs) t.lastTs = ts;
            const dt = (ts - t.lastTs) / 1000;
            t.lastTs = ts;

            const jitter = 0.85 + Math.random() * 0.4;
            const add = Math.max(1, Math.floor(dt * TYPE_SPEED_CPS * jitter));

            // prefer typing shortAnswer if it exists and isn't finished yet
            const shortRemaining = t.targetShort.length - t.iShort;
            const answerRemaining = t.targetAnswer.length - t.iAnswer;

            if (shortRemaining > 0) {
                t.iShort = Math.min(t.targetShort.length, t.iShort + add);
                patchTurn(turnId, { shortAnswer: t.targetShort.slice(0, t.iShort) });
            } else if (answerRemaining > 0) {
                t.iAnswer = Math.min(t.targetAnswer.length, t.iAnswer + add);
                patchTurn(turnId, { answer: t.targetAnswer.slice(0, t.iAnswer) });
            } else {
                // done
                patchTurn(turnId, { typingShort: false, typingAnswer: false });
                t.raf = null;
                t.lastTs = 0;
                return;
            }

            t.raf = requestAnimationFrame(step);
        };

        tw.raf = requestAnimationFrame(step);
    };

    function DotsIndicator({ size = 6, gap = 6, color = theme.typingDot }) {
        const a1 = useRef(new Animated.Value(0.25)).current;
        const a2 = useRef(new Animated.Value(0.25)).current;
        const a3 = useRef(new Animated.Value(0.25)).current;

        const loop = (v, delay) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(v, { toValue: 1, duration: 250, useNativeDriver: true }),
                    Animated.timing(v, { toValue: 0.25, duration: 250, useNativeDriver: true }),
                    Animated.delay(250),
                ])
            );

        useEffect(() => {
            const anim = Animated.parallel([loop(a1, 0), loop(a2, 120), loop(a3, 240)]);
            anim.start();
            return () => anim.stop();
        }, [a1, a2, a3]);

        const dotStyle = (opacityVal) => ({
            width: size,
            height: size,
            borderRadius: size / 2,
            marginRight: gap,
            backgroundColor: color,
            opacity: opacityVal,
            transform: [
                {
                    translateY: opacityVal.interpolate({
                        inputRange: [0.25, 1],
                        outputRange: [0, -3],
                    }),
                },
            ],
        });

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityRole="progressbar" accessibilityLabel="Laster eksempler">
                <Animated.View style={dotStyle(a1)} />
                <Animated.View style={dotStyle(a2)} />
                <Animated.View style={[dotStyle(a3), { marginRight: 0 }]} />
            </View>
        );
    }

    const scrollToBottom = (animated = true) => {
        if (scrollRafRef.current) return;

        scrollRafRef.current = requestAnimationFrame(() => {
            const contentH = contentHRef.current || 0;
            const layoutH = layoutHRef.current || 0;
            const y = Math.max(0, contentH - layoutH);

            scrollRef.current?.scrollTo?.({ y, animated });
            scrollRafRef.current = null;
        });
    };

    const fetchSources = async () => {
        setSourcesLoading(true);
        setSourcesError('');
        try {
            const res = await fetch(`${webserverEndPoint}/documents`, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    Accept: 'application/json',
                },
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            setSources(Array.isArray(data.documents) ? data.documents : []);
        } catch (err) {
            setSourcesError('Kunne ikke hente kildene akkurat nå. Prøv igjen senere.');
            setSources([]);
        } finally {
            setSourcesLoading(false);
        }
    };

    const openSources = () => {
        setSourcesOpen(true);
        fetchSources();
    };

    const fetchExamples = async () => {
        setExamplesLoading(true);
        setExampleCategories([]);
        try {
            const res = await fetch(`${webserverEndPoint}/examples`, {
                method: 'POST',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },

                body: JSON.stringify({
                    agent: "hvaerinnafor_examples",
                    clientType,
                    session_id: chatId,
                    vectorIndex,
                    // No requested_categories → server discovers categories from
                    // the QA bank index and returns them (see /examples).
                }),
            });

            if (!res.ok) {
                setExamplesLoading(false);
                return;
            }

            await handleStream(res, 'examples');
        } finally {
            setExamplesLoading(false);
        }
    };

    useEffect(() => {
        fetchExamples();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    function RelatedSendButton({ onPress, disabled, selected }) {
        return (
            <TouchableOpacity
                style={styles.relatedSendBtn}
                onPress={onPress}
                disabled={disabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send relatert spørsmål"
            >
                <ArrowUpSvg
                    color={theme.iconColor}
                    backgroundColor={theme.inputBackground}
                    selected={selected}
                    size={38}
                    strokeWidth={1.0}
                />
            </TouchableOpacity>
        );
    }
    const toggleFeedback = (turnId, type /* 'up' | 'down' */) => {
        setFeedbackByTurnId((prev) => {
            const current = prev[turnId];              // 'up' | 'down' | undefined
            const next = current === type ? null : type; // toggle av/på
            return { ...prev, [turnId]: next };
        });
    };
    function SourcesButton({ open, onPress, focused }) {
        return (
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.85}
                style={[styles.sourcesIconButton, focused && styles.sourcesIconButtonFocused]}
                accessibilityRole="button"
                accessibilityLabel={open ? 'Skjul kilder' : 'Vis kilder'}
            >
                {open ? (
                    <CloseIconSvg color={theme.iconColor} size={38} />
                ) : (
                    <LinksIconSvg color={theme.iconColor} size={38} strokeWidth={1.0} />
                )}
            </TouchableOpacity>
        );
    }


    const toggleSources = (turnId) => {
        setExpandedSourcesById((prev) => {
            const nextOpen = !prev[turnId];
            return nextOpen ? { [turnId]: true } : {};
        });
    };

    const toggleStatus = (turnId) => {
        setExpandedStatusById((prev) => {
            const nextOpen = !prev[turnId];
            return nextOpen ? { [turnId]: true } : {};
        });
    };

    const toggleSysInfo = (turnId) => {
        setExpandedSysInfoById((prev) => ({ ...prev, [turnId]: !prev[turnId] }));
    };


    const patchTurn = (turnId, patch) => {
        setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
    };

    const appendToTurn = (turnId, field, chunk) => {
        if (!chunk) return;
        setTurns((prev) =>
            prev.map((t) => {
                if (t.id !== turnId) return t;
                return { ...t, [field]: (t[field] || '') + chunk };
            })
        );
    };

    const ensureTurnExists = () => {
        if (!pendingQuestionRef.current) return;

        const { id, question } = pendingQuestionRef.current;

        setTurns((prev) => [
            ...prev,
            {
                id,
                question,
                refinedQuestion: '',
                answer: '',
                shortAnswer: '',
                sourcesMarkdown: '',
                similarQuestions: [],
                queryStatus: null,
                systemInfo: [],
                loading: true,
                typingShort: false,
                typingAnswer: false,
                errorText: null,
                showDetailed: false,
            },
        ]);

        pendingQuestionRef.current = null;
    };

    const updateAnswer = (chunk) => {
        const turnId = activeTurnIdRef.current;
        if (!turnId) return;
        appendToTurn(turnId, 'answer', chunk);
    };

    const updateShortAnswer = (chunk) => {
        const turnId = activeTurnIdRef.current;
        if (!turnId || !chunk) return;
        if (!chunk.trim()) return;

        setTurns((prev) =>
            prev.map((t) => {
                if (t.id !== turnId) return t;
                return { ...t, shortAnswer: (t.shortAnswer || '') + chunk };
            })
        );

        shortAnswerRef.current = (shortAnswerRef.current || '') + chunk;
    };

    const handleStream = async (response, streamTarget = 'chat', turnIdOverride = null) => {
        const reader =
            response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;

        if (!reader) {
            const text = await response.text();
            // fallback: write into latest turn if exists
            if (streamTarget === 'chat') {
                ensureTurnExists();
                updateAnswer(text || 'Jeg fant dessverre ikke noe svar akkurat nå.');
            }
            return;
        }

        const decoder = new TextDecoder('utf-8');
        let carry = '';
        let serverDone = false;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            carry += decoder.decode(value, { stream: true });

            let nl;
            while ((nl = carry.indexOf('\n')) >= 0) {
                let line = carry.slice(0, nl);
                carry = carry.slice(nl + 1);

                if (line.startsWith(':')) continue; // SSE comment (e.g. heartbeat) — ignore per spec
                line = line.replace(/^data:\s?/, '').trim();
                if (line === '[DONE]') { serverDone = true; continue; }
                if (!line) continue;

                let payload = null;
                if (line.startsWith('{') && line.endsWith('}')) {
                    try {
                        payload = JSON.parse(line);
                    } catch (e) {
                        payload = null;
                    }
                }

                if (payload && typeof payload === 'object') {
                    const ev = payload.event;

                    const turnIdForEvent = turnIdOverride ?? activeTurnIdRef.current;

                    switch (ev) {
                        case 'examples_categories': {
                            if (streamTarget !== 'examples') continue;

                            const items = Array.isArray(payload.items) ? payload.items : [];

                            setExampleCategories(
                                items.map((c) => ({
                                    id: c.id ?? c.title ?? String(c),
                                    title: c.title ?? String(c),
                                    items: Array.isArray(c.items)
                                        ? c.items.map((x) => {
                                            if (typeof x === 'string') return { query: x, node_id: null };
                                            if (x && typeof x.query === 'string') return { query: x.query, node_id: x.node_id ?? null };
                                            return null;
                                        }).filter(Boolean)
                                        : [],
                                    open: false,
                                    loading: false,
                                }))
                            );
                            continue;
                        }

                        case 'refined query': {
                            let rq = '';
                            if (typeof payload.structured_answer_delta === 'string') rq = payload.structured_answer_delta;
                            else if (typeof payload.delta === 'string') rq = payload.delta;
                            else if (typeof payload.text === 'string') rq = payload.text;

                            rq = (rq || '').trim();
                            if (rq) {
                                const turnId = activeTurnIdRef.current;
                                patchTurn(turnId, { refinedQuestion: rq });
                                refinedQueryRef.current = rq;
                                urlQueryRef.current = rq;
                            }
                            continue;
                        }

                        case 'answer': {
                            ensureTurnExists();
                            if (!turnIdForEvent) continue;
                            const chunk =
                                typeof payload.structured_answer_delta === 'string'
                                    ? payload.structured_answer_delta
                                    : typeof payload.delta === 'string'
                                        ? payload.delta
                                        : typeof payload.text === 'string'
                                            ? payload.text
                                            : '';
                            console.log("ANSWER CHUNK:", chunk);
                            appendToTurn(turnIdForEvent, 'answer', chunk);
                            continue;
                        }
                        case 'short_answer': {
                            ensureTurnExists();
                            if (!turnIdForEvent) continue;
                            const chunk =
                                typeof payload.structured_answer_delta === 'string'
                                    ? payload.structured_answer_delta
                                    : typeof payload.delta === 'string'
                                        ? payload.delta
                                        : typeof payload.text === 'string'
                                            ? payload.text
                                            : '';
                            console.log("SHORT ANSWER CHUNK:", chunk);
                            const turnId = activeTurnIdRef.current;

                            // ✅ animate instead of instant render
                            startTypewriter(turnId, "shortAnswer", chunk);

                            continue;
                        }

                        case 'similar':
                        case 'related queries': {
                            //if (!turnIdForEvent) continue;
                            const src =
                                payload.items ??
                                payload.similar ??
                                payload.related_queries ??
                                payload.data ??
                                payload.structured_answer_delta ??
                                payload.delta ??
                                payload.text ??   // ✅ important
                                [];

                            let arr = [];
                            if (Array.isArray(src)) arr = src;
                            else if (typeof src === 'string') {
                                try { arr = JSON.parse(src); } catch { arr = []; }
                            }
                            console.log("SIMILAR/RELATED RAW:", src);

                            const normalized = arr
                                .map((x) => {
                                    if (typeof x === 'string') {
                                        return { query: x, node_id: null, prefix: pickRandom(RELATED_PREFIXES) };
                                    }
                                    if (x && typeof x.query === 'string') {
                                        return {
                                            query: x.query,
                                            node_id: x.node_id ?? null,
                                            prefix: pickRandom(RELATED_PREFIXES),
                                        };
                                    }
                                    return null;
                                })
                                .filter(Boolean);

                            const turnId = turnIdOverride ?? activeTurnIdRef.current;
                            if (!turnId) continue;

                            // ✅ ignore late empty updates
                            if (normalized.length > 0) {
                                patchTurn(turnId, { similarQuestions: normalized });
                            }

                            continue;
                        }

                        case 'query_status': {
                            if (!turnIdForEvent) continue;
                            const raw =
                                typeof payload.structured_answer_delta === 'string'
                                    ? payload.structured_answer_delta
                                    : typeof payload.delta === 'string'
                                        ? payload.delta
                                        : typeof payload.text === 'string'
                                            ? payload.text
                                            : null;
                            if (!raw) continue;
                            try {
                                const status = JSON.parse(raw);
                                patchTurn(turnIdForEvent, { queryStatus: status });
                            } catch (e) { /* ignore malformed status */ }
                            continue;
                        }

                        case 'systeminfo': {
                            if (!turnIdForEvent) continue;
                            const delta =
                                typeof payload.structured_answer_delta === 'string'
                                    ? payload.structured_answer_delta
                                    : typeof payload.delta === 'string'
                                        ? payload.delta
                                        : typeof payload.text === 'string'
                                            ? payload.text
                                            : null;
                            if (delta == null) continue;
                            setTurns((prev) =>
                                prev.map((t) =>
                                    t.id === turnIdForEvent
                                        ? { ...t, systemInfo: [...(t.systemInfo || []), delta] }
                                        : t
                                )
                            );
                            continue;
                        }

                        case 'refs':
                        case 'references': {
                            if (!turnIdForEvent) continue;
                            const delta =
                                typeof payload.structured_answer_delta === 'string'
                                    ? payload.structured_answer_delta
                                    : typeof payload.delta === 'string'
                                        ? payload.delta
                                        : typeof payload.text === 'string'
                                            ? payload.text
                                            : null;

                            if (!delta) continue;

                            appendToTurn(turnIdForEvent, 'sourcesMarkdown', delta);
                            continue;
                        }

                        case 'done':
                            // Don't abandon the reader here — keep reading so the
                            // server closes the connection first and reader.read()
                            // returns {done:true}. Returning early tears down the
                            // body stream and the server logs it as a client abort.
                            serverDone = true;
                            continue;

                        default:
                            continue;
                    }
                }

                // non-JSON line
                if (streamTarget === 'chat') {
                    ensureTurnExists();
                    updateAnswer(line + '\n');
                }
            }

            // Server signalled completion: stop reading once the current buffer
            // is drained. The server's generator has already returned by now, so
            // releasing the reader here won't surface as a client-abort.
            if (serverDone) break;
        }

        // Graceful close instead of letting GC tear down the body stream.
        try { await reader.cancel(); } catch { /* already closed */ }
    };

    useEffect(() => {
        const turnId = pendingScrollToTurnRef.current;
        if (!turnId) return;

        const y = turnYRef.current[turnId];
        if (typeof y !== "number") return;

        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ y, animated: true });
            pendingScrollToTurnRef.current = null;
        });
    }, [turns]);

    useEffect(() => {
        // start off-screen to the right
        slideX.setValue(0);
    }, [slideX]);

    // Poll /healthz on mount until the backend reports ready.
    // First check is immediate; subsequent checks every 2s. We do an
    // initial optimistic ready=true above so the UI doesn't flash a banner
    // before we've heard back; the first failed/loading response flips it.
    useEffect(() => {
        let cancelled = false;

        async function poll() {
            // Initial settle delay so a fast-ready server doesn't show a flash.
            await new Promise((res) => setTimeout(res, 100));
            while (!cancelled) {
                try {
                    const r = await fetch(`${webserverEndPoint}/healthz`, {
                        cache: 'no-store',
                    });
                    if (cancelled) return;
                    const d = await r.json();
                    if (d.ready) {
                        setServerReady(true);
                        setServerMessage(null);
                        return;
                    }
                    setServerReady(false);
                    setServerMessage(
                        d.message ||
                            'Serveren laster fortsatt indekser. Prøv igjen om noen sekunder.'
                    );
                } catch {
                    if (cancelled) return;
                    setServerReady(false);
                    setServerMessage('Får ikke kontakt med serveren. Prøver igjen…');
                }
                await new Promise((res) => setTimeout(res, 2000));
            }
        }

        poll();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleNewChat = () => {
        abortRef.current?.abort?.();
        abortRef.current = null;
        activeTurnIdRef.current = null;
        setTurns([]);
        setInput('');
        setLoading(false);
        Keyboard.dismiss?.();
    };

    const openExamples = () => {
        setExamplesOpen(true);
        fetchExamples();

        Animated.timing(slideX, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();
    };
    const closeExamples = () => {
        examplesAbortRef.current?.abort?.();

        Animated.timing(slideX, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) setExamplesOpen(false);
        });
    };

    const renderTopicsBubbles = ({ closePanelAfterSend = false } = {}) => {
        if (topicCards.length === 0) {
            return (
                <Text style={styles.topicQuestionsEmpty}>
                    {examplesLoading ? 'Henter temaer…' : 'Ingen temaer tilgjengelig.'}
                </Text>
            );
        }
        return (
            <>
                <View style={styles.topicsGrid}>
                    {visibleTopics.map((topic) => {
                        const isActive = topic.id === activeTopicId;
                        return (
                            <TouchableOpacity
                                key={topic.id}
                                activeOpacity={0.85}
                                onPress={() => setActiveTopicId(isActive ? null : topic.id)}
                                style={[
                                    styles.topicCard,
                                    { backgroundColor: topic.bg },
                                    isActive && styles.topicCardActive,
                                ]}
                            >
                                <Text style={styles.topicCardTitle}>{topic.title}</Text>
                                {topic.blurb ? (
                                    <Text style={styles.topicCardBlurb}>{topic.blurb}</Text>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {totalTopicPages > 1 && (
                    <View style={styles.topicsPager}>
                        <TouchableOpacity
                            onPress={() => setTopicPage((p) => Math.max(0, p - 1))}
                            disabled={topicPage === 0}
                            accessibilityLabel="Forrige temaer"
                            style={[
                                styles.pagerBtn,
                                topicPage === 0 && styles.pagerBtnDisabled,
                            ]}
                        >
                            <ChevronSvg color={theme.textSecondary} direction="left" size={16} />
                        </TouchableOpacity>
                        <Text style={styles.pagerIndicator}>
                            {topicPage + 1} / {totalTopicPages}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setTopicPage((p) => Math.min(totalTopicPages - 1, p + 1))}
                            disabled={topicPage >= totalTopicPages - 1}
                            accessibilityLabel="Flere temaer"
                            style={[
                                styles.pagerBtn,
                                topicPage >= totalTopicPages - 1 && styles.pagerBtnDisabled,
                            ]}
                        >
                            <ChevronSvg color={theme.textSecondary} direction="right" size={16} />
                        </TouchableOpacity>
                    </View>
                )}

                {activeTopic && (
                    <View style={styles.topicQuestionsSection}>
                        <Text style={styles.topicQuestionsLabel}>
                            Spørsmål om {activeTopic.title.toLowerCase()}
                        </Text>
                        {activeTopic.items.length === 0 ? (
                            <Text style={styles.topicQuestionsEmpty}>
                                {examplesLoading
                                    ? 'Henter spørsmål…'
                                    : 'Ingen spørsmål tilgjengelig.'}
                            </Text>
                        ) : (
                            <View style={styles.topicQuestions}>
                                {activeTopic.items.map((item, i) => {
                                    const key = `topic-${activeTopic.id}-${i}`;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            activeOpacity={0.85}
                                            disabled={loading}
                                            onPress={() => {
                                                setActiveRelatedKey(key);
                                                handleSend(item.query, true, item.node_id);
                                                setActiveTopicId(null);
                                                if (closePanelAfterSend) closeExamples();
                                            }}
                                            style={styles.topicQuestionChip}
                                        >
                                            <Text style={styles.topicQuestionChipText}>{item.query}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                )}
            </>
        );
    };

    const handleSend = async (overrideQ, fromRelated = false, fromNodeId = null) => {

        if (activeTurnIdRef.current) cancelTypewriter(activeTurnIdRef.current);

        const q = (overrideQ ?? input).trim();
        if (!q || loading) return;

        if (Platform.OS !== "web") {
            Keyboard.dismiss();
            inputRef.current?.blur?.(); // extra safe
        }

        abortRef.current?.abort?.();
        const controller = new AbortController();
        abortRef.current = controller;

        const turnId = uuidv4();
        activeTurnIdRef.current = turnId;

        pendingQuestionRef.current = { id: turnId, question: q };
        ensureTurnExists();      // ✅ show the question bubble immediately
        scrollToBottom(false)

        setExpandedSourcesById({});
        setExpandedStatusById({});
        setLoading(true);
        if (!fromRelated) setActiveRelatedKey(null);
        setPromptHeight(INPUT_MIN_HEIGHT);

        try {
            const res = await fetch(`${webserverEndPoint}/chat`, {
                method: 'POST',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    messages: [{ role: 'user', content: q }],
                    session_id: chatId,
                    similarity_top_k,
                    similarity_cutoff,
                    claims_valid_threshold,


                    vectorIndex,
                    stream: true,
                    clientType,
                    agent: fromRelated ? 'hvaerinnafor_related_qa' : 'hvaerinnafor',
                    from_related_q: fromRelated,
                    from_node_id: fromNodeId,
                    // Optional override for the answer rewrite style. Omitted
                    // when 'auto' is selected, so the server falls back to
                    // pick_response_style(severity, stance).
                    ...(responseStyleValue && { response_style: responseStyleValue }),
                }),
            });

            if (!res.ok) {
                const msg = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${msg?.slice(0, 200)}`);
            }

            await handleStream(res, 'chat', turnId);
        } catch (err) {
            pendingQuestionRef.current = null;
            cancelTypewriter(turnId);
            if (err?.name !== 'AbortError') {
                patchTurn(turnId, { errorText: 'Noe gikk galt. Prøv igjen senere.', loading: false });
            }
        } finally {
            patchTurn(turnId, { loading: false });
            setLoading(false);
            setActiveRelatedKey(null);
            setInput('');
            setPromptHeight(INPUT_MIN_HEIGHT);
        }
    };

    const handleChangeText = (text) => {
        setInput(text.replace(/\r/g, ''));
    };

    function TypingDots() {
        const [frame, setFrame] = useState(0);
        const intervalRef = useRef(null);

        useEffect(() => {
            intervalRef.current = setInterval(() => {
                setFrame((f) => (f + 1) % TYPING_FRAMES.length);
            }, 150);

            return () => {
                if (intervalRef.current) clearInterval(intervalRef.current);
            };
        }, []);

        const src = TYPING_FRAMES[frame];
        const maskUrl = `url(${src})`;
        return (
            <View
                style={[
                    styles.typingIcon,
                    {
                        backgroundColor: theme.typingIconColor,
                        WebkitMaskImage: maskUrl,
                        maskImage: maskUrl,
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                    },
                ]}
            />
        );
    }

    return (


        <View style={styles.safe}>
            <KeyboardAvoidingView style={styles.safe}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            >
                {/*<View style={styles.container}>*/}
                <View
                    style={[
                        styles.container,
                        isDesktopBrowser ? styles.containerWeb : styles.containerMobile,
                        { backgroundColor: theme.containerBackground },
                    ]}
                >

                    {/* HEADER */}
                    <View
                        style={[
                            styles.headerOverlay,
                            {
                                height: `calc(env(safe-area-inset-top) + ${HEADER_HEIGHT}px)`,
                                backgroundColor: 'transparent',
                                backgroundImage: `linear-gradient(to bottom, ${theme.headerGradientStart} 0%, ${theme.headerGradientEnd} 100%)`,
                            }
                        ]}
                    >
                        <View
                            style={[
                                styles.headerRowInner,
                                Platform.OS === 'web' ? { paddingTop: 'env(safe-area-inset-top)' } : null
                            ]}
                        >
                            <HdirLogo
                                width={52}
                                height={40}
                                style={{
                                    '--logo-primary': theme.logoPrimary,
                                    '--logo-secondary': theme.logoSecondary,
                                }}
                            />

                            <View style={styles.headerRightGroup}>
                                {isDesktopBrowser && (
                                    <View style={styles.tbStatus}>
                                        <View style={styles.tbStatusIconWrap}>
                                            <ShieldLockIconSvg color="#2EB872" size={20} strokeWidth={1.6} />
                                        </View>
                                        <Text style={styles.tbStatusText}>Trygg & anonym</Text>
                                    </View>
                                )}
                                <TouchableOpacity
                                    onPress={handleNewChat}
                                    activeOpacity={0.8}
                                    style={styles.tbIconBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel="Ny samtale"
                                >
                                    <EditIconSvg color={theme.textPrimary} size={18} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={openSettings}
                                    activeOpacity={0.8}
                                    style={styles.tbIconBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel="Innstillinger"
                                >
                                    <HamburgerIconSvg color={theme.textPrimary} size={20} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => {
                                        setActiveTopicId(null);
                                        examplesOpen ? closeExamples() : openExamples();
                                    }}
                                    activeOpacity={0.8}
                                    style={styles.examplesLinkBtn}
                                    accessibilityLabel={examplesOpen ? 'Lukk temaer' : 'Vis temaer'}
                                >
                                    {examplesOpen ? (
                                        <CloseIconSvg color={theme.iconColor} size={38} strokeWidth={1.0}/>
                                    ) : (
                                        <ExpandIconSvg color={theme.iconColor} size={38} strokeWidth={1.0}/>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* SETTINGS DRAWER */}
                    {settingsOpen && (
                        <>
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={closeSettings}
                                style={styles.settingsBackdrop}
                            />
                            <Animated.View
                                style={[
                                    styles.settingsDrawer,
                                    {
                                        transform: [
                                            {
                                                translateX: settingsSlideX.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [360, 0],
                                                }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                <View style={styles.settingsHeader}>
                                    <Text style={styles.settingsTitle}>Innstillinger</Text>
                                    <TouchableOpacity
                                        onPress={closeSettings}
                                        style={styles.settingsCloseBtn}
                                        accessibilityLabel="Lukk innstillinger"
                                    >
                                        <CloseIconSvg color={theme.iconColor} size={32} strokeWidth={1.2} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView contentContainerStyle={styles.settingsList}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setHelpOpen(true);
                                            closeSettings();
                                        }}
                                        activeOpacity={0.7}
                                        style={styles.settingsHelpLink}
                                    >
                                        <Text style={styles.settingsHelpLinkText}>Om HEI</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => {
                                            openSources();
                                            closeSettings();
                                        }}
                                        activeOpacity={0.7}
                                        style={styles.settingsHelpLink}
                                    >
                                        <Text style={styles.settingsHelpLinkText}>Kildene mine</Text>
                                    </TouchableOpacity>

                                    <Text style={styles.settingsSectionLabel}>TEMA</Text>
                                    <View style={styles.settingsPills}>
                                        {themes.map((t) => {
                                            const active = t.name === themeName;
                                            return (
                                                <TouchableOpacity
                                                    key={t.name}
                                                    onPress={() => setThemeName(t.name)}
                                                    activeOpacity={0.85}
                                                    style={[
                                                        styles.settingsPill,
                                                        active && styles.settingsPillActive,
                                                    ]}
                                                >
                                                    <View
                                                        style={[
                                                            styles.settingsSwatch,
                                                            {
                                                                backgroundColor: t.swatch,
                                                                borderColor: theme.textPrimary,
                                                            },
                                                        ]}
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.settingsPillText,
                                                            active && styles.settingsPillTextActive,
                                                        ]}
                                                    >
                                                        {t.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <Text style={styles.settingsSectionLabel}>SVARSTIL</Text>
                                    <View style={styles.settingsPills}>
                                        {Object.entries(RESPONSE_STYLES).map(([key, cfg]) => {
                                            const active = responseStyleKey === key;
                                            return (
                                                <TouchableOpacity
                                                    key={key}
                                                    onPress={() => setResponseStyleKey(key)}
                                                    activeOpacity={0.85}
                                                    style={[
                                                        styles.settingsPill,
                                                        active && styles.settingsPillActive,
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.settingsPillText,
                                                            active && styles.settingsPillTextActive,
                                                        ]}
                                                    >
                                                        {cfg.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </ScrollView>
                            </Animated.View>
                        </>
                    )}

                    {/* HELP OVERLAY */}
                    {helpOpen && (
                        <View style={styles.helpOverlay}>
                            <View style={styles.helpHeader}>
                                <Text style={styles.helpTitle}>Om HEI</Text>
                                <TouchableOpacity
                                    onPress={() => setHelpOpen(false)}
                                    style={styles.settingsCloseBtn}
                                    accessibilityLabel="Lukk hjelp"
                                >
                                    <CloseIconSvg color={theme.iconColor} size={32} strokeWidth={1.2} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView contentContainerStyle={styles.helpContent}>
                                <Text style={styles.helpParagraph}>
                                    HEI er en chatbot som svarer på spørsmål om forhold, følelser, kropp og seksualitet. Tjenesten er anonym og laget for ungdom.
                                </Text>

                                <Text style={styles.helpSectionTitle}>Slik fungerer det</Text>
                                <Text style={styles.helpParagraph}>
                                    Svarene baseres på tekster fra eksperter, samlet og kvalitetssikret av Helsedirektoratet. Du kan stille spørsmål med egne ord, eller velge fra temakortene øverst.
                                </Text>

                                <Text style={styles.helpSectionTitle}>Personvern</Text>
                                <Text style={styles.helpParagraph}>
                                    Spørsmålene dine sendes til en server for å generere et svar, men kobles ikke til deg som person. Du kan stille spørsmål uten å oppgi navn eller annen identifiserende informasjon.
                                </Text>

                                <Text style={styles.helpSectionTitle}>Trygg bruk</Text>
                                <Text style={styles.helpParagraph}>
                                    HEI erstatter ikke profesjonell helsehjelp. Trenger du noen å snakke med, ring Alarmtelefonen for barn og unge på 116 111. Ved akutt fare, ring 113.
                                </Text>

                                <Text style={styles.helpSectionTitle}>Innstillinger</Text>
                                <Text style={styles.helpParagraph}>
                                    Du kan endre fargetema og svarstil i menyen øverst til høyre. Svarstilen påvirker tonen i svarene — "Auto" lar systemet velge, mens de andre tvinger en bestemt tilnærming.
                                </Text>
                            </ScrollView>
                        </View>
                    )}

                    {/* SOURCES OVERLAY ("Kildene mine") */}
                    {sourcesOpen && (
                        <View style={styles.helpOverlay}>
                            <View style={styles.helpHeader}>
                                <Text style={styles.helpTitle}>Kildene mine</Text>
                                <TouchableOpacity
                                    onPress={() => setSourcesOpen(false)}
                                    style={styles.settingsCloseBtn}
                                    accessibilityLabel="Lukk kildene mine"
                                >
                                    <CloseIconSvg color={theme.iconColor} size={32} strokeWidth={1.2} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView contentContainerStyle={styles.helpContent}>
                                <Text style={styles.helpParagraph}>
                                    Dette er kildene HEI bruker for å svare på spørsmålene dine. Tekstene er samlet og kvalitetssikret av Helsedirektoratet.
                                </Text>

                                {sourcesLoading && (
                                    <View style={styles.sourcesStatusRow}>
                                        <DotsIndicator color={theme.textPrimary} />
                                        <Text style={styles.helpParagraph}>Henter kildene …</Text>
                                    </View>
                                )}

                                {!sourcesLoading && !!sourcesError && (
                                    <Text style={styles.helpParagraph}>{sourcesError}</Text>
                                )}

                                {!sourcesLoading && !sourcesError && sources.length === 0 && (
                                    <Text style={styles.helpParagraph}>Fant ingen kilder.</Text>
                                )}

                                {!sourcesLoading && !sourcesError && sources.map((doc) => {
                                    const title = doc.title || doc.url;
                                    return (
                                        <TouchableOpacity
                                            key={doc.url || title}
                                            activeOpacity={doc.url ? 0.7 : 1}
                                            onPress={() => doc.url && Linking.openURL(doc.url)}
                                            style={styles.sourceItem}
                                            accessibilityRole={doc.url ? 'link' : 'text'}
                                        >
                                            <Text style={styles.sourceItemTitle}>{title}</Text>
                                            {!!doc.category && (
                                                <Text style={styles.sourceItemCategory}>{doc.category}</Text>
                                            )}
                                            {!!doc.description && (
                                                <Text style={styles.sourceItemDescription} numberOfLines={3}>
                                                    {doc.description}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}


                    {/* MIDDLE */}
                    <View style={styles.middle}>
                        {/* Server-not-ready banner. Shown while /healthz reports
                            ready:false (indexes still loading) or fetch fails
                            (server down). Hidden once the backend is ready. */}
                        {!serverReady && !!serverMessage && (
                            <View
                                style={styles.serverStatusBanner}
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                            >
                                <DotsIndicator color={theme.textPrimary} />
                                <Text style={styles.serverStatusText}>{serverMessage}</Text>
                            </View>
                        )}

                        <ScrollView
                            ref={scrollRef}
                            style={styles.scroll}
                            contentContainerStyle={styles.scrollContent}
                            keyboardShouldPersistTaps="handled"
                            onLayout={(e) => {
                                layoutHRef.current = e.nativeEvent.layout.height;
                                scrollToBottom(false);
                            }}
                            onContentSizeChange={(w, h) => {
                                contentHRef.current = h;
                                scrollToBottom(true); // ✅ always
                            }}
                        >
                            <View style={styles.scrollTopSpacer} />

                            {(turns.length === 0 || examplesOpen) ? (
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyStateTitle}>
                                        Hei. Hva tenker du på i dag?
                                    </Text>
                                    <Text style={styles.emptyStateSub}>
                                        Trygg, anonym hjelp om forhold, forelskelse og sex. Du kan også få svar på spørsmål om onani, porno, bildedeling og mye mer. Svarene er kvalitetssikret av Helsedirektoratet.
                                    </Text>
                                    {renderTopicsBubbles({ closePanelAfterSend: true })}
                                    {examplesOpen && turns.length > 0 && (
                                        <TouchableOpacity
                                            onPress={closeExamples}
                                            activeOpacity={0.7}
                                            style={styles.topicsBackBtn}
                                        >
                                            <Text style={styles.topicsBackText}>Tilbake til samtalen</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                turns.map((turn) => {
                                    const hasSources = !!turn.sourcesMarkdown?.trim();
                                    const isOpen = !!expandedSourcesById[turn.id];

                                    const shortText = turn.shortAnswer ?? '';
                                    const detailedText = turn.answer ?? '';
                                    const primaryText = detailedText.length ? detailedText : shortText;
                                    const isTypingPrimary = detailedText.length ? !!turn.typingAnswer : !!turn.typingShort;

                                    const refsLines = (turn.sourcesMarkdown || '').split('\n').filter(Boolean);

                                    const feedback = feedbackByTurnId[turn.id];
                                    const upSelected = feedback === 'up';
                                    const downSelected = feedback === 'down';


                                    return (
                                        <View
                                            key={turn.id}
                                            style={{ marginBottom: 18 }}
                                            onLayout={(e) => {
                                                turnYRef.current[turn.id] = e.nativeEvent.layout.y;
                                            }}
                                        >
                                            <View style={styles.questionBubble}>
                                                <Text style={styles.questionText}>{turn.refinedQuestion || turn.question}</Text>
                                            </View>

                                            {/* ✅ stream like ChatGPT: Text while loading, Markdown when done */}
                                            {!!primaryText && (
                                                isTypingPrimary ? (
                                                    <Text style={styles.answerStreamingText}>{primaryText}</Text>
                                                ) : (
                                                    <Markdown style={markdownStyles}>{primaryText}</Markdown>
                                                )
                                            )}

                                            {(hasSources || !!turn.queryStatus) && (
                                                <View style={{ marginTop: 10 }}>
                                                    <View style={styles.headerControls}>
                                                        <View style={styles.thumbRow}>
                                                            <TouchableOpacity
                                                                onPress={() => toggleFeedback(turn.id, 'up')}
                                                                style={styles.thumbBtn}
                                                                activeOpacity={0.85}
                                                            >
                                                                <ThemedIcon
                                                                    source={upSelected ? Thumbs_up_dark : Thumbs_up_light}
                                                                    color={theme.textPrimary}
                                                                    style={styles.thumbIcon}
                                                                />
                                                            </TouchableOpacity>

                                                            <TouchableOpacity
                                                                onPress={() => toggleFeedback(turn.id, 'down')}
                                                                style={styles.thumbBtn}
                                                                activeOpacity={0.85}
                                                            >
                                                                <ThemedIcon
                                                                    source={downSelected ? Thumbs_down_dark : Thumbs_down_light}
                                                                    color={theme.textPrimary}
                                                                    style={styles.thumbIcon}
                                                                />
                                                            </TouchableOpacity>

                                                            {!!turn.queryStatus && (
                                                                <TouchableOpacity
                                                                    onPress={() => toggleStatus(turn.id)}
                                                                    style={styles.thumbBtn}
                                                                    activeOpacity={0.85}
                                                                    accessibilityRole="button"
                                                                    accessibilityLabel={expandedStatusById[turn.id] ? 'Skjul tekniske detaljer' : 'Vis tekniske detaljer'}
                                                                    accessibilityState={{ expanded: !!expandedStatusById[turn.id] }}
                                                                >
                                                                    <InfoIconSvg color={theme.textPrimary} size={32} strokeWidth={1.4} />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>

                                                        {hasSources && (
                                                            <SourcesButton
                                                                open={isOpen}
                                                                onPress={() => toggleSources(turn.id)}
                                                                focused={textInputFocused}
                                                            />
                                                        )}
                                                    </View>

                                                    {!!turn.queryStatus && expandedStatusById[turn.id] && (
                                                        <View style={styles.statusBubble}>
                                                            <TouchableOpacity
                                                                onPress={() => toggleStatus(turn.id)}
                                                                activeOpacity={0.7}
                                                                style={styles.statusCloseBtn}
                                                                accessibilityRole="button"
                                                                accessibilityLabel="Lukk tekniske detaljer"
                                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            >
                                                                <CloseIconSvg color={theme.textPrimary} size={22} strokeWidth={1.2} />
                                                            </TouchableOpacity>
                                                            {[
                                                                ['Omformulert', turn.queryStatus.refined_query],
                                                                ['Alvorlighet', turn.queryStatus.query_severity],
                                                                ['Stance', turn.queryStatus.stance],
                                                                ['Tense (harm)', turn.queryStatus.harm_to_others_tense],
                                                                ['Kjønn', turn.queryStatus.asker_gender],
                                                                ['Svarstil', (() => {
                                                                    const s = turn.queryStatus.response_style;
                                                                    const src = turn.queryStatus.response_style_source;
                                                                    if (!s) return '—';
                                                                    if (src === 'auto')        return `${s} (auto)`;
                                                                    if (src === 'forced_red')  return `${s} (forced — Red)`;
                                                                    if (src === 'override')    return `${s} (klient)`;
                                                                    return s;
                                                                })()],
                                                                ['Relevans', turn.queryStatus.relevancy_band],
                                                                ['Topp-score', typeof turn.queryStatus.best_node_score === 'number'
                                                                    ? turn.queryStatus.best_node_score.toFixed(3)
                                                                    : ''],
                                                                ['Response satt', turn.queryStatus.response_set ? 'ja' : 'nei'],
                                                                ['Validering', turn.queryStatus.validate_response_result],
                                                                ['Tokens (inn/ut)', `${turn.queryStatus.input_tokens ?? '–'} / ${turn.queryStatus.output_tokens ?? '–'}`],
                                                                ['– herav hoved', `${turn.queryStatus.main_input_tokens ?? '–'} / ${turn.queryStatus.main_output_tokens ?? '–'}`],
                                                                ['– herav fast', `${turn.queryStatus.fast_input_tokens ?? '–'} / ${turn.queryStatus.fast_output_tokens ?? '–'}`],
                                                                ['Kostnad', (() => {
                                                                    const nok = turn.queryStatus.cost_nok;
                                                                    return typeof nok === 'number' ? `${nok.toFixed(4)} kr` : '—';
                                                                })()],
                                                            ].map(([k, v], idx) => (
                                                                <View key={idx} style={styles.statusRow}>
                                                                    <Text style={styles.statusKey}>{k}</Text>
                                                                    <Text style={styles.statusVal} selectable>{String(v ?? '—') || '—'}</Text>
                                                                </View>
                                                            ))}

                                                            {Array.isArray(turn.systemInfo) && turn.systemInfo.length > 0 && (
                                                                <View style={styles.sysInfoSection}>
                                                                    <TouchableOpacity
                                                                        onPress={() => toggleSysInfo(turn.id)}
                                                                        activeOpacity={0.7}
                                                                        style={styles.sysInfoToggle}
                                                                        accessibilityRole="button"
                                                                        accessibilityLabel={expandedSysInfoById[turn.id] ? 'Skjul hendelser' : 'Vis hendelser'}
                                                                        accessibilityState={{ expanded: !!expandedSysInfoById[turn.id] }}
                                                                    >
                                                                        <Text style={styles.sysInfoToggleText}>
                                                                            {(expandedSysInfoById[turn.id] ? '▾' : '▸') + ` Hendelser (${turn.systemInfo.length})`}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                    {expandedSysInfoById[turn.id] && (
                                                                        <ScrollView style={styles.sysInfoScroll} nestedScrollEnabled>
                                                                            <Text style={styles.sysInfoText} selectable>
                                                                                {turn.systemInfo.join('\n')}
                                                                            </Text>
                                                                        </ScrollView>
                                                                    )}
                                                                </View>
                                                            )}
                                                        </View>
                                                    )}

                                                    {isOpen && (
                                                        <View style={styles.refsBubble}>
                                                            <View style={styles.refsTail} />
                                                            {refsLines.map((line, idx) => {
                                                                const hasImg = line.includes('||IMG||');
                                                                const [left, imgUrlRaw] = hasImg ? line.split('||IMG||') : [line, null];
                                                                const imgUrl = (imgUrlRaw || '').trim();

                                                                const m = left.match(/\[([^\]]+)\]\(([^)]+)\)/);
                                                                const text = (m?.[1] || left || '').trim();
                                                                const href = (m?.[2] || '').trim();

                                                                return (
                                                                    <TouchableOpacity
                                                                        key={idx}
                                                                        onPress={() => href && Linking.openURL(href)}
                                                                        activeOpacity={0.8}
                                                                        style={styles.refsRow}
                                                                    >
                                                                        <View style={styles.refsTextWrap}>
                                                                            <Text style={styles.refsText} numberOfLines={2}>
                                                                                {text}
                                                                            </Text>
                                                                        </View>


                                                                        {imgUrl && imgUrl !== 'Ingen URL for ikon' ? (
                                                                            <Image source={{ uri: imgUrl }} style={styles.refsThumb} resizeMode="cover" />
                                                                        ) : href.includes('ung.no/oss') ? (
                                                                            <Image
                                                                                source={{ uri: sporsmaal_svar }}
                                                                                style={[styles.refsThumb, { tintColor: theme.iconColor }]}
                                                                                resizeMode="contain"
                                                                            />
                                                                        ) : null}
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    )}
                                                </View>
                                            )}

                                            {!!turn.similarQuestions?.length && (
                                                <View style={styles.relatedInline}>
                                                    {turn.similarQuestions.map((item, i) => {
                                                        const key = `${turn.id}-${i}`;
                                                        const isActive = activeRelatedKey === key;

                                                        return (
                                                            <View key={key} style={styles.relatedRow}>
                                                                <TouchableOpacity
                                                                    onPress={() => {
                                                                        setActiveRelatedKey(key);
                                                                        handleSend(item.query, true, item.node_id);
                                                                    }}
                                                                    style={styles.relatedTextBtn}
                                                                    activeOpacity={0.85}
                                                                >
                                                                    <Text style={styles.relatedText}>
                                                                        {item.prefix} {item.query}
                                                                    </Text>
                                                                </TouchableOpacity>

                                                                <RelatedSendButton
                                                                    onPress={() => {
                                                                        setActiveRelatedKey(key);
                                                                        handleSend(item.query, true, item.node_id);
                                                                    }}
                                                                    selected={isActive && loading}
                                                                    disabled={loading}
                                                                />
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })
                            )}

                            
                        </ScrollView>
                    </View>

                    {/* FOOTER */}
                    <View style={styles.bottomArea}>
                        {/* A/B controls panel — toggled by the inline "Modus" pill
                            inside the input below. Holds the Retrieval and Stil
                            selectors plus the (i) info toggle. Only visible when
                            controlsOpen is true; otherwise the current selection
                            is summarised on the pill itself. */}
                        {controlsOpen && (
                            <View style={styles.controlsPanel}>
                                <TouchableOpacity
                                    onPress={() => setControlsOpen(false)}
                                    activeOpacity={0.7}
                                    style={styles.controlsCloseBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel="Lukk modus-valg"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <CloseIconSvg color={theme.iconColor} size={22} strokeWidth={1.2} />
                                </TouchableOpacity>

                                <View style={styles.controlsRow}>
                                    <Text style={styles.controlsLabel}>Retrieval</Text>
                                    <View style={styles.controlsPills}>
                                        {Object.entries(RETRIEVAL_MODES).map(([key, cfg]) => {
                                            const active = retrievalMode === key;
                                            return (
                                                <TouchableOpacity
                                                    key={key}
                                                    onPress={() => setRetrievalMode(key)}
                                                    activeOpacity={0.85}
                                                    style={[styles.modeBtn, active && styles.modeBtnActive]}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected: active }}
                                                    accessibilityLabel={`Retrieval mode: ${cfg.label}`}
                                                >
                                                    <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
                                                        {cfg.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setModeInfoOpen((v) => !v)}
                                        activeOpacity={0.85}
                                        style={styles.modeInfoBtn}
                                        accessibilityRole="button"
                                        accessibilityLabel={modeInfoOpen ? 'Skjul info om moduser' : 'Vis info om moduser'}
                                        accessibilityState={{ expanded: modeInfoOpen }}
                                    >
                                        <InfoIconSvg color={theme.iconColor} size={32} strokeWidth={1.4} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.controlsDivider} />

                                <View style={styles.controlsRow}>
                                    <Text style={styles.controlsLabel}>Stil</Text>
                                    <View style={styles.controlsPills}>
                                        {Object.entries(RESPONSE_STYLES).map(([key, cfg]) => {
                                            const active = responseStyleKey === key;
                                            return (
                                                <TouchableOpacity
                                                    key={key}
                                                    onPress={() => setResponseStyleKey(key)}
                                                    activeOpacity={0.85}
                                                    style={[styles.modeBtn, active && styles.modeBtnActive]}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected: active }}
                                                    accessibilityLabel={`Response style: ${cfg.label}`}
                                                >
                                                    <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
                                                        {cfg.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                            </View>
                        )}

                        {/* Mode-info panel. Plain text so it stays readable in both
                            light and dark themes; content mirrors the server-side
                            cascade described next to RETRIEVAL_MODES. */}
                        {modeInfoOpen && (
                            <View style={styles.modeInfoPanel}>
                                <TouchableOpacity
                                    onPress={() => setModeInfoOpen(false)}
                                    activeOpacity={0.7}
                                    style={styles.controlsCloseBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel="Lukk info om moduser"
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <CloseIconSvg color={theme.iconColor} size={22} strokeWidth={1.2} />
                                </TouchableOpacity>
                                <Text style={styles.modeInfoTitle}>Hva gjør modusene?</Text>

                                <Text style={styles.modeInfoBody}>
                                    Begreper:{' '}
                                    <Text style={styles.termLink} onPress={() => toggleTerm('artikkel')}>{INDEX_GLOSSARY.artikkel.label}</Text>
                                    {' · '}
                                    <Text style={styles.termLink} onPress={() => toggleTerm('qa')}>{INDEX_GLOSSARY.qa.label}</Text>
                                    {' · '}
                                    <Text style={styles.termLink} onPress={() => toggleTerm('hybrid')}>{INDEX_GLOSSARY.hybrid.label}</Text>
                                </Text>
                                {selectedTerm && (
                                    <Text style={styles.glossaryDesc}>
                                        <Text style={styles.modeInfoEm}>{INDEX_GLOSSARY[selectedTerm].label}: </Text>
                                        {INDEX_GLOSSARY[selectedTerm].desc}
                                    </Text>
                                )}
                                <Text style={styles.modeInfoMode}>Art</Text>
                                <Text style={styles.modeInfoBody}>
                                    {' '}Hver spørring går rett inn i{' '}
                                    <Text style={styles.termLink} onPress={() => toggleTerm('artikkel')}>{INDEX_GLOSSARY.artikkel.label}</Text>
                                    {' '}— kun artikkeltekst som grunnlag for svaret.
                                </Text>

                                <Text style={styles.modeInfoMode}>Hyb</Text>
                                <Text style={styles.modeInfoBody}>
                                    {' '}Hver eneste spørring går rett inn i{' '}
                                    <Text style={styles.termLink} onPress={() => toggleTerm('hybrid')}>{INDEX_GLOSSARY.hybrid.label}</Text>,
                                    {' '}der artikkel-noder og spørsmål&svar-noder konkurrerer på likt grunnlag i samme retrieval-kall.
                                </Text>
                            </View>
                        )}

                        <View style={styles.inputWrapper}>
                            <AnimatedTextInput
                                ref={inputRef}
                                style={[
                                    styles.input,
                                    {
                                        height: promptHeight,
                                        minHeight: INPUT_MIN_HEIGHT,
                                        maxHeight: 160,
                                    },
                                    isWeb && {
                                        outlineStyle: 'none',
                                        outlineWidth: 0,
                                        outlineColor: 'transparent',
                                    },
                                ]}
                                editable={!loading && serverReady}
                                placeholder={serverReady ? 'Spør om hva som helst!' : 'Venter på serveren…'}
                                placeholderTextColor={theme.inputPlaceholder}
                                value={input}
                                onChangeText={handleChangeText}
                                multiline
                                scrollEnabled={false}
                                returnKeyType="send"
                                onFocus={() => setTextInputFocused(true)}
                                onBlur={() => setTextInputFocused(false)}
                                onContentSizeChange={(e) => {
                                    const contentHeight = e.nativeEvent.contentSize.height;
                                    const newHeight = Math.min(160, Math.max(INPUT_MIN_HEIGHT, contentHeight));
                                    setPromptHeight(newHeight);
                                }}
                                onKeyPress={(e) => {
                                    if (e.nativeEvent.key === 'Enter' && !e.shiftKey) {
                                        if (isWeb && e.preventDefault) e.preventDefault();
                                        const trimmed = input.trim();
                                        if (trimmed) handleSend(trimmed);
                                    }
                                }}
                                onSubmitEditing={() => {
                                    const trimmed = input.trim();
                                    if (trimmed) handleSend(trimmed);
                                }}
                            />

                            <View style={styles.inputBottomBar}>
                                {/* Modus pill — toggles the controls panel above.
                                    Summarises the current Retrieval + Stil choice
                                    so users see at a glance what the next request
                                    will be sent under without expanding the panel. */}
                                <TouchableOpacity
                                    onPress={() => setControlsOpen((v) => !v)}
                                    activeOpacity={0.85}
                                    style={[styles.modusPill, controlsOpen && styles.modusPillActive]}
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: controlsOpen }}
                                    accessibilityLabel={controlsOpen ? 'Skjul modus-valg' : 'Vis modus-valg'}
                                >
                                    <SlidersIconSvg color={theme.iconColor} size={14} />
                                    <Text style={styles.modusPillLabel}>Modus</Text>
                                    <Text style={styles.modusPillDivider}>|</Text>
                                    <Text style={styles.modusPillValue}>
                                        {RETRIEVAL_MODES[retrievalMode].label}
                                        {' · '}
                                        {RESPONSE_STYLES[responseStyleKey].label}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.sendButton}
                                    onPress={() => handleSend(input.trim())}
                                    disabled={loading || !input.trim() || !serverReady}
                                >
                                    {loading ? (
                                        <TypingDots />
                                    ) : (
                                        <ArrowUpSvg
                                            color={theme.iconColor}
                                            backgroundColor={theme.inputBackground}
                                            selected={textInputFocused}
                                            size={38}
                                            strokeWidth={1.0}
                                        />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.disclaimer}>
                            Svarene er basert på tekster som er skrevet av mennesker og er kvalitetssikret av Helsedirektoratet.
                        </Text>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

/* --- STYLES --- */
const HEADER_HEIGHT = 64;

const makeStyles = (theme) => StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 4,
        paddingBottom: 8,
        backgroundColor: 'transparent',
    },
    containerWeb: {
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        boxSizing: 'border-box',

        borderRadius: 16,
        backgroundColor: theme.containerBackground,
        boxShadow: theme.cardBoxShadow,
        borderWidth: 1,
        paddingHorizontal: 2,
        borderColor: theme.containerBorder,
    },
    containerMobile: {
        flex: 1,
        paddingTop: 4,
        paddingBottom: 8,
        paddingHorizontal: 2,
    },
    headerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_HEIGHT,
        zIndex: 10,
        paddingHorizontal: 12,
        justifyContent: 'center',

        borderBottomWidth: 0,
        borderBottomColor: theme.panelBorderSubtle,
    },

    logo: {
        width: 52,
        height: 40,
    },

    middle: {
        flex: 1,
        minHeight: 0,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingVertical: 12,
        paddingHorizontal: 20,
    },

    questionBubble: {
        alignSelf: 'flex-end',
        backgroundColor: theme.bubbleUserBackground,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginBottom: 16,
        maxWidth: '90%',
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    questionText: {
        textAlign: 'right',
        fontSize: 18,
        color: theme.bubbleUserText,
    },

    headerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },

    relatedInline: {
        marginTop: 5,
        padding: 10,
        borderRadius: 12,
        backgroundColor: theme.panelBackground,
    },
    relatedItem: {
        paddingVertical: 6,
    },
    relatedText: {
        fontSize: 15,
        lineHeight: 18,
        color: theme.textPrimary,
        fontStyle: 'italic',
    },

    bottomArea: {
        paddingTop: 8,
        alignItems: 'center',
        paddingHorizontal: 22,
    },
    inputWrapper: {
        flexDirection: 'column',
        alignItems: 'stretch',
        borderRadius: 14,
        backgroundColor: theme.inputBackground,
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 8,
        width: '100%',
        borderWidth: 1,
        borderColor: theme.inputBorder,
    },
    input: {
        width: '100%',
        fontSize: 18,
        lineHeight: 22,
        paddingTop: 14,
        paddingBottom: 6,
        paddingRight: 4,
        color: theme.inputText,
        borderWidth: 0,
        backgroundColor: 'transparent',
        ...(Platform.OS === 'android' && { textAlignVertical: 'top' }),
    },
    inputBottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    modusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.inputBorder,
        backgroundColor: 'transparent',
    },
    modusPillActive: {
        backgroundColor: theme.panelBackground,
        borderColor: theme.panelBorderSubtle,
    },
    modusPillLabel: {
        fontSize: 12,
        color: theme.textPrimary,
        fontWeight: '500',
    },
    modusPillDivider: {
        fontSize: 12,
        color: theme.textSecondary,
        marginHorizontal: 2,
    },
    modusPillValue: {
        fontSize: 12,
        color: theme.textSecondary,
    },

    sendButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    sendImage: {
        width: 32,
        height: 32,
    },

    typingIcon: {
        width: 32,
        height: 32,
    },

    disclaimer: {
        fontSize: 11,
        textAlign: 'center',
        color: theme.textSecondary,
        marginTop: 8,
    },

    sourcesIconButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginBottom: 8,
        borderRadius: 999,
        borderWidth: 0,
        borderColor: theme.inputBorder,
        backgroundColor: theme.panelBackground,
    },
    sourcesIconButtonFocused: {
        opacity: 0.95,
    },
    refsBubble: {
        marginTop: 8,
        backgroundColor: theme.bubbleSourcesBackground,
        borderRadius: 18,
        paddingVertical: 8,
        paddingLeft: 14,
        paddingRight: 14,
        position: 'relative',

        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 1,
    },

    statusBubble: {
        position: 'relative',
        marginTop: 8,
        backgroundColor: theme.bubbleSourcesBackground,
        borderRadius: 14,
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: 14,
        paddingRight: 40, // leave room for the absolute-positioned close button
        shadowColor: theme.shadowColor,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 1,
    },
    statusCloseBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 3,
    },
    statusKey: {
        width: 130,
        fontSize: 12,
        color: theme.textPrimary,
        opacity: 0.7,
    },
    statusVal: {
        flex: 1,
        fontSize: 12,
        color: theme.textPrimary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    sysInfoSection: {
        marginTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.textPrimary,
        paddingTop: 6,
    },
    sysInfoToggle: {
        paddingVertical: 4,
    },
    sysInfoToggleText: {
        fontSize: 12,
        color: theme.textPrimary,
        opacity: 0.7,
    },
    sysInfoScroll: {
        marginTop: 4,
        maxHeight: 220,
    },
    sysInfoText: {
        fontSize: 11,
        lineHeight: 16,
        color: theme.textPrimary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },

    refsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingRight: 6,
        width: '100%',
    },

    refsTextWrap: {
        flex: 1,
        paddingRight: 10,
    },

    refsText: {
        fontSize: 18,
        lineHeight: 22,
        color: theme.textPrimary,
        textDecorationLine: 'underline',
    },

    refsThumb: {
        marginLeft: 'auto',
        width: 34,
        height: 34,
        borderRadius: 8,
    },
    refsTail: {
        position: 'absolute',
        top: -10,
        right: 32,
        width: 30,
        height: 40,
        backgroundColor: theme.bubbleSourcesTail,
        transform: [{ rotate: '60deg' }],
        borderRadius: 4,
    },
    thumbRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },

    thumbBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        marginRight: 0,
    },

    thumbIcon: {
        width: 26,
        height: 26,
    },
    relatedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 0,
    },

    relatedTextBtn: {
        flex: 1,
        paddingVertical: 2,
    },

    relatedSendBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
    },

    relatedSendIcon: {
        width: 28,
        height: 28,
    },
    headerRowInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerRightGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    tbStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    tbStatusIconWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    tbStatusText: {
        fontSize: 12.5,
        color: theme.textSubtle,
    },
    tbIconBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.panelBackground,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
        borderRadius: 12,
        marginRight: 8,
    },

    examplesLinkBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: theme.pillBackground,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },

    examplesLinkText: {
        fontSize: 14,
        color: theme.pillText,
        paddingRight: 12,
    },

    examplesBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 19,
        backgroundColor: theme.backdropColor,
    },

    examplesPanel: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        zIndex: 20,
        backgroundColor: theme.panelBackground,
        borderLeftWidth: 1,
        borderLeftColor: theme.panelBorder,
        paddingTop: HEADER_HEIGHT,
    },

    examplesHeader: {
        paddingHorizontal: 16,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: theme.panelBorderSubtle,
    },

    examplesTitle: {
        fontSize: 14,
        color: theme.textPrimary,
        paddingRight: 6,
    },

    examplesCloseBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },

    examplesCloseText: {
        fontSize: 14,
        color: theme.textPrimary,
    },

    examplesList: {
        padding: 16,
    },

    scrollTopSpacer: {
        height:
            Platform.OS === 'web'
                ? `calc(env(safe-area-inset-top) + ${HEADER_HEIGHT + 8}px)`
                : HEADER_HEIGHT + 8,
    },

    examplesCategoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 2,
    },

    examplesCategoryTitle: { fontSize: 16, color: theme.textPrimary, fontWeight: '600' },
    examplesChevron: { fontSize: 18, color: theme.textPrimary, marginRight: 8 },

    examplesCategoryItems: { paddingLeft: 4, paddingTop: 6 },

    examplesLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 14,
    },
    emptyState: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    emptyStateText: {
        fontSize: 18,
        lineHeight: 24,
        color: theme.textPrimary,
        textAlign: 'center',
    },
    emptyStateTextItalic: {
        fontSize: 18,
        lineHeight: 24,
        color: theme.textPrimary,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    emptyStateTitle: {
        fontSize: 36,
        lineHeight: 40,
        fontWeight: '500',
        letterSpacing: -0.7,
        color: theme.textPrimary,
        textAlign: 'center',
        marginBottom: 14,
        maxWidth: 760,
    },
    emptyStateSub: {
        fontSize: 15,
        lineHeight: 23,
        color: theme.textSecondary,
        textAlign: 'center',
        maxWidth: 520,
    },

    topicsGrid: {
        width: '100%',
        maxWidth: 760,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 14,
        marginTop: 36,
    },
    topicCard: {
        flexBasis: 'calc(50% - 7px)',
        minHeight: 96,
        padding: 18,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
        flexDirection: 'column',
        gap: 6,
    },
    topicCardActive: {
        borderColor: '#062330',
        borderWidth: 1.5,
    },
    topicCardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#062330',
        letterSpacing: -0.1,
    },
    topicCardBlurb: {
        fontSize: 13.5,
        lineHeight: 19,
        color: 'rgba(6,35,48,0.7)',
        marginTop: 4,
    },
    topicsPager: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 16,
    },
    pagerBtn: {
        width: 32,
        height: 32,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
        backgroundColor: theme.panelBackground,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pagerBtnDisabled: {
        opacity: 0.35,
    },
    pagerIndicator: {
        fontSize: 12.5,
        color: theme.textSecondary,
        minWidth: 34,
        textAlign: 'center',
    },
    topicQuestionsSection: {
        width: '100%',
        maxWidth: 760,
        marginTop: 24,
        alignItems: 'center',
    },
    topicQuestionsLabel: {
        fontSize: 11,
        color: theme.textSubtle,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 12,
        textAlign: 'center',
    },
    topicQuestions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
    topicQuestionChip: {
        backgroundColor: theme.panelBackground,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 14,
    },
    topicQuestionChipText: {
        fontSize: 13.5,
        color: theme.textPrimary,
    },
    topicQuestionsEmpty: {
        fontSize: 13,
        color: theme.textSubtle,
        fontStyle: 'italic',
    },
    topicsBackBtn: {
        marginTop: 24,
        paddingVertical: 8,
        paddingHorizontal: 14,
    },
    topicsBackText: {
        fontSize: 13.5,
        color: theme.textSecondary,
        textDecorationLine: 'underline',
    },

    settingsBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.backdropColor,
        zIndex: 30,
    },
    settingsDrawer: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        maxWidth: '100%',
        backgroundColor: theme.containerBackground,
        borderLeftWidth: 1,
        borderLeftColor: theme.panelBorderSubtle,
        zIndex: 31,
        flexDirection: 'column',
    },
    settingsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 'env(safe-area-inset-top)',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.panelBorderSubtle,
    },
    settingsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.textPrimary,
    },
    settingsCloseBtn: {
        padding: 4,
    },
    settingsList: {
        padding: 20,
    },
    settingsSectionLabel: {
        fontSize: 11,
        color: theme.textSubtle,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 12,
        marginTop: 8,
    },
    settingsPills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 24,
    },
    settingsPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.panelBackground,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginRight: 8,
        marginBottom: 8,
    },
    settingsPillActive: {
        backgroundColor: theme.textPrimary,
        borderColor: theme.textPrimary,
    },
    settingsPillText: {
        fontSize: 13.5,
        color: theme.textPrimary,
    },
    settingsPillTextActive: {
        color: theme.containerBackground,
    },
    settingsSwatch: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.5,
        marginRight: 8,
    },
    settingsHelpLink: {
        marginBottom: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.panelBorderSubtle,
    },
    settingsHelpLinkText: {
        fontSize: 14,
        color: theme.textPrimary,
        fontWeight: '500',
    },

    helpOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.containerBackground,
        zIndex: 40,
        flexDirection: 'column',
    },
    helpHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 'env(safe-area-inset-top)',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.panelBorderSubtle,
    },
    helpTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: theme.textPrimary,
    },
    helpContent: {
        padding: 24,
        maxWidth: 720,
        alignSelf: 'center',
        width: '100%',
    },
    helpSectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.textPrimary,
        marginTop: 20,
        marginBottom: 8,
    },
    helpParagraph: {
        fontSize: 14.5,
        lineHeight: 22,
        color: theme.textSecondary,
        marginBottom: 6,
    },

    sourcesStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    sourceItem: {
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.panelBorderSubtle,
    },
    sourceItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.textPrimary,
        marginBottom: 2,
    },
    sourceItemCategory: {
        fontSize: 12,
        color: theme.textSubtle,
        letterSpacing: 0.4,
        marginBottom: 4,
    },
    sourceItemDescription: {
        fontSize: 13.5,
        lineHeight: 20,
        color: theme.textSecondary,
    },

    answerStreamingText: {
        fontSize: 18,
        lineHeight: 22,
        color: theme.textPrimary,
    },

    // A/B controls panel — expanded card above the input that holds the
    // Retrieval and Stil rows. Toggled by the inline Modus pill in the input.
    controlsPanel: {
        position: 'relative',
        marginBottom: 8,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 10,
        paddingRight: 40, // leave room for the absolute-positioned close button
        borderRadius: 14,
        backgroundColor: theme.inputBackground,
        borderWidth: 1,
        borderColor: theme.inputBorder,
    },
    controlsCloseBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
    },
    controlsLabel: {
        fontSize: 13,
        color: theme.textPrimary,
        fontWeight: '500',
        width: 64,
    },
    controlsPills: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    controlsDivider: {
        height: 1,
        backgroundColor: theme.inputBorder,
        opacity: 0.5,
        marginVertical: 2,
    },
    modeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.inputBorder,
        backgroundColor: theme.panelBackground,
    },
    modeBtnActive: {
        backgroundColor: theme.bubbleUserBackground,
        borderColor: theme.bubbleUserBackground,
    },
    modeBtnText: {
        fontSize: 12,
        color: theme.textPrimary,
    },
    modeBtnTextActive: {
        color: theme.bubbleUserText,
        fontWeight: '600',
    },
    modeInfoBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        marginLeft: 4,
    },
    modeInfoPanel: {
        position: 'relative',
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 12,
        paddingRight: 40, // leave room for the absolute-positioned close button
        borderRadius: 12,
        backgroundColor: theme.panelBackground,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
    },
    modeInfoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.textPrimary,
        marginBottom: 8,
    },
    modeInfoSubtitle: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.textPrimary,
        marginTop: 10,
        marginBottom: 4,
    },
    modeInfoMode: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.textPrimary,
        marginTop: 6,
        marginBottom: 2,
    },
    modeInfoBody: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.textPrimary,
    },
    modeInfoMono: {
        fontFamily: Platform.OS === 'web' ? 'monospace' : 'Menlo',
        fontSize: 11,
    },
    modeInfoEm: {
        fontWeight: '700',
    },
    termLink: {
        color: theme.link,
        textDecorationLine: 'underline',
    },
    glossaryDesc: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.textPrimary,
        backgroundColor: theme.bubbleSourcesBackground,
        padding: 8,
        borderRadius: 8,
        marginTop: 6,
        marginBottom: 6,
    },

    // Server-not-ready banner shown above the ScrollView while /healthz
    // reports ready=false. Slim, themed, with a status dot animation.
    serverStatusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 20,
        marginTop: HEADER_HEIGHT + 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.panelBorderSubtle,
        backgroundColor: theme.panelBackground,
    },
    serverStatusText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 18,
        color: theme.textPrimary,
    },
});


/* Markdown-stil for svar-teksten */
const makeMarkdownStyles = (theme) => ({
    body: { color: theme.textPrimary },
    paragraph: {
        fontSize: 18,
        lineHeight: 22,
        marginBottom: 6,
        color: theme.textPrimary,
    },
    link: {
        fontSize: 15,
        color: theme.link,
        textDecorationLine: 'underline',
    },
    bullet_list: {
        marginBottom: 8,
    },
    ordered_list: {
        marginBottom: 8,
    },
    list_item: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    bullet_list_icon: {
        fontSize: 18,
        lineHeight: 22,
        color: theme.textPrimary,
    },
    bullet_list_content: {
        flex: 1,
        fontSize: 18,
        lineHeight: 22,
        color: theme.textPrimary,
    },
    ordered_list_icon: {
        fontSize: 18,
        lineHeight: 22,
        color: theme.textPrimary,
    },
    ordered_list_content: {
        flex: 1,
        fontSize: 18,
        lineHeight: 22,
        color: theme.textPrimary,
    },
});