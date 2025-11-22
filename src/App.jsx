import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Play, Pause, Map as MapIcon, AlertTriangle,
    Activity, Truck, DollarSign, Clock, Calendar,
    ShieldAlert, Eye, EyeOff, BarChart2, MousePointer,
    ChevronRight, ChevronLeft
} from 'lucide-react';

// --- CONFIGURACIÓN GEOGRÁFICA ---
const LEON_CENTER = [21.1221, -101.67];
const SILAO_CENTER = [20.9435, -101.425];
const PLANTA_CENTRAL = { lat: 21.025, lon: -101.635 };

const INITIAL_VIEW = { center: [21.07, -101.55], zoom: 11 };

const GEOFENCES = {
    G1: { id: 'G1', name: 'Zona Norte', bounds: [21.135, -101.70, 21.165, -101.66], color: '#10b981' },
    G2: { id: 'G2', name: 'Zona Este', bounds: [21.09, -101.65, 21.13, -101.60], color: '#3b82f6' },
    G3: { id: 'G3', name: 'Zona Sur', bounds: [21.05, -101.66, 21.08, -101.62], color: '#ef4444' },
};

// Utilidades
const isInside = (lat, lon, bounds) => lat >= bounds[0] && lat <= bounds[2] && lon >= bounds[1] && lon <= bounds[3];
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// --- GENERADOR DE DATOS "SCHEDULE-FIRST" ---
const DAYS_TO_SIMULATE = 30;
const START_HOUR = 6; // 06:00 AM
const END_HOUR = 18; // 06:00 PM
const TOTAL_MINS = (END_HOUR - START_HOUR) * 60; // 720 mins
const STEP_MINS = 3;
const POINTS_PER_DAY = TOTAL_MINS / STEP_MINS;

const getRandomPos = (bounds) => ({
    lat: bounds[0] + Math.random() * (bounds[2] - bounds[0]),
    lon: bounds[1] + Math.random() * (bounds[3] - bounds[1])
});

const generateDailySchedule = (pipaId, dayIndex, isSunday) => {
    const schedule = [];
    let currentTime = 0;

    const geoKey = pipaId === 'pipa_1' ? 'G1' : pipaId === 'pipa_2' ? 'G2' : 'G3';
    const bounds = GEOFENCES[geoKey].bounds;

    const g2SubBounds = [
        bounds[2] - (bounds[2] - bounds[0]) * 0.4, bounds[1],
        bounds[2], bounds[1] + (bounds[3] - bounds[1]) * 0.4
    ];
    const operationalBounds = pipaId === 'pipa_2' ? g2SubBounds : bounds;

    let currentPos = { ...PLANTA_CENTRAL };

    let targetServices = 0;
    if (!isSunday) {
        if (pipaId === 'pipa_1') targetServices = 20 + Math.floor(Math.random() * 5);
        if (pipaId === 'pipa_2') targetServices = 10 + Math.floor(Math.random() * 4);
        if (pipaId === 'pipa_3') targetServices = 4 + Math.floor(Math.random() * 3);
    }
    if (isSunday && pipaId === 'pipa_3' && dayIndex > 20) targetServices = 4;

    // 1. TRASLADO INICIAL (OBLIGATORIO)
    if (targetServices > 0 || !isSunday) {
        let firstDest = getRandomPos(operationalBounds);
        const distToZone = getDistanceKm(currentPos.lat, currentPos.lon, firstDest.lat, firstDest.lon);
        const commuteTime = Math.max(35, Math.round((distToZone / 30) * 60) + 10);

        schedule.push({ type: 'travel', duration: commuteTime, startPos: { ...currentPos }, endPos: firstDest });
        currentTime += commuteTime;
        currentPos = firstDest;
    }

    // RUTINA OPERATIVA
    while (currentTime < (TOTAL_MINS - 60)) {
        if (targetServices > 0) {
            // A. Viaje al cliente
            const travelTime = pipaId === 'pipa_3' ? 30 + Math.random() * 30 : 8 + Math.random() * 12;
            let targetPos = getRandomPos(operationalBounds);

            if (pipaId === 'pipa_3') {
                targetPos = Math.random() > 0.6 ?
                    { lat: SILAO_CENTER[0] + (Math.random() - 0.5) * 0.01, lon: SILAO_CENTER[1] + (Math.random() - 0.5) * 0.01 } :
                    getRandomPos(bounds);
            }

            schedule.push({ type: 'travel', duration: travelTime, startPos: { ...currentPos }, endPos: targetPos });
            currentTime += travelTime;
            currentPos = targetPos;

            // B. Servicio
            let serviceTime = 12 + Math.random() * 8;
            if (pipaId === 'pipa_1') serviceTime = 4 + Math.random() * 3;

            schedule.push({ type: 'service', duration: serviceTime, pos: { ...currentPos } });
            currentTime += serviceTime;
            targetServices--;

            // C. Idle (Gris)
            let idleTime = 3 + Math.random() * 5;
            if (pipaId === 'pipa_1') idleTime = 6 + Math.random() * 6;

            schedule.push({ type: 'idle', duration: idleTime, pos: { ...currentPos } });
            currentTime += idleTime;

        } else {
            break;
        }
    }

    // 2. REGRESO A PLANTA (OBLIGATORIO AL FINAL)
    if (currentTime < TOTAL_MINS) {
        const distHome = getDistanceKm(currentPos.lat, currentPos.lon, PLANTA_CENTRAL.lat, PLANTA_CENTRAL.lon);
        const returnTime = Math.max(40, Math.round((distHome / 35) * 60) + 10);

        schedule.push({ type: 'travel', duration: returnTime, startPos: { ...currentPos }, endPos: { ...PLANTA_CENTRAL } });
        currentTime += returnTime;

        // Resto del día Idle en planta
        const remaining = TOTAL_MINS - currentTime;
        if (remaining > 0) {
            schedule.push({ type: 'idle', duration: remaining, pos: { ...PLANTA_CENTRAL } });
        }
    }

    return schedule;
};

// Se añade pipaId como argumento para personalizar comportamiento de velocidad
const generatePointsFromSchedule = (schedule, date, pipaId) => {
    const points = [];
    let currentScheduleIdx = 0;
    let timeInEvent = 0;

    const baseTime = new Date(date);
    baseTime.setHours(START_HOUR, 0, 0, 0);

    for (let i = 0; i < POINTS_PER_DAY; i++) {
        const minsFromStart = i * STEP_MINS;
        let event = schedule[currentScheduleIdx];

        while (event && (timeInEvent >= event.duration)) {
            timeInEvent -= event.duration;
            currentScheduleIdx++;
            event = schedule[currentScheduleIdx];
        }

        if (!event) break;

        const pointTime = new Date(baseTime.getTime() + minsFromStart * 60000);
        let lat, lon, speed, valve;

        if (event.type === 'idle') {
            lat = event.pos.lat;
            lon = event.pos.lon;
            speed = 0;
            valve = false;
        } else if (event.type === 'service') {
            lat = event.pos.lat;
            lon = event.pos.lon;
            speed = 0;
            valve = true;
        } else if (event.type === 'travel') {
            const progress = Math.min(1, (timeInEvent + (Math.random() * STEP_MINS)) / event.duration);
            lat = event.startPos.lat + (event.endPos.lat - event.startPos.lat) * progress;
            lon = event.startPos.lon + (event.endPos.lon - event.startPos.lon) * progress;

            const distTotal = getDistanceKm(event.startPos.lat, event.startPos.lon, event.endPos.lat, event.endPos.lon);
            const speedKmh = (distTotal / (event.duration / 60));
            speed = speedKmh * (0.8 + Math.random() * 0.4);

            if (speed < 10) speed = 20;
            if (speed > 90 && distTotal < 5) speed = 45;

            // LÓGICA DE EXCESO DE VELOCIDAD FORZADO
            // Si es Pipa 3 y el tramo es largo (carretera), forzamos picos altos
            if (pipaId === 'pipa_3' && event.duration > 20) {
                if (Math.random() > 0.6) {
                    speed = 90 + Math.random() * 20; // 90-110 km/h (Alerta Roja Segura)
                }
            }
            // Ocasionalmente Pipa 2 también corre
            if (pipaId === 'pipa_2' && Math.random() > 0.95) {
                speed = 85 + Math.random() * 10;
            }

            valve = false;
        }

        points.push({
            lat, lon, ts: pointTime.toISOString(), speed: Math.round(speed), valve,
            isSunday: new Date(date).getDay() === 0
        });

        timeInEvent += STEP_MINS;
    }
    return points;
};

const generateData = () => {
    const data = { pipa_1: {}, pipa_2: {}, pipa_3: {} };
    const dateKeys = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - DAYS_TO_SIMULATE);

    for (let d = 0; d < DAYS_TO_SIMULATE; d++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + d);
        const dateKey = currentDate.toISOString().split('T')[0];
        dateKeys.push(dateKey);
        const isSunday = currentDate.getDay() === 0;

        ['pipa_1', 'pipa_2', 'pipa_3'].forEach(pipaId => {
            const isRogue = isSunday && pipaId === 'pipa_3' && d > 20;
            if (isSunday && !isRogue) {
                data[pipaId][dateKey] = [];
                return;
            }
            const schedule = generateDailySchedule(pipaId, d, isSunday);
            // Pasamos pipaId para lógica específica de velocidad
            data[pipaId][dateKey] = generatePointsFromSchedule(schedule, dateKey, pipaId);
        });
    }
    return { data, dateKeys };
};

const { data: SIM_DATA, dateKeys } = generateData();

// --- HELPERS ---

const countServiceEvents = (points) => {
    let count = 0;
    let inService = false;
    points.forEach(p => {
        if (p.valve && !inService) {
            count++;
            inService = true;
        } else if (!p.valve) {
            inService = false;
        }
    });
    return count;
};

const generateStats = (pipaId, mode, dayIdx, data) => {
    try {
        if (!data || !data[pipaId]) return { km: 0, valves: 0, maxSpeed: 0, efficiency: 0 };

        let points = [];
        if (mode === 'daily') {
            const keys = Object.keys(data[pipaId]);
            const key = keys[dayIdx];
            if (key && data[pipaId][key]) {
                points = data[pipaId][key];
            }
        } else {
            // Period mode: aggregate all points
            const allKeys = Object.keys(data[pipaId]);
            points = allKeys.reduce((acc, k) => {
                const dayPoints = data[pipaId][k];
                if (Array.isArray(dayPoints)) {
                    return acc.concat(dayPoints);
                }
                return acc;
            }, []);
        }

        if (!Array.isArray(points)) points = [];

        let totalKm = 0;
        for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            if (p1 && p2 && typeof p1.lat === 'number' && typeof p1.lon === 'number' && typeof p2.lat === 'number' && typeof p2.lon === 'number') {
                totalKm += getDistanceKm(p1.lat, p1.lon, p2.lat, p2.lon);
            }
        }

        const serviceEvents = countServiceEvents(points);
        const maxSpeed = points.reduce((max, p) => (p && p.speed > max) ? p.speed : max, 0);
        const days = mode === 'daily' ? 1 : (Object.keys(data[pipaId]).length || 1);
        const efficiency = totalKm > 0 ? (serviceEvents / days / (totalKm / days / 10)).toFixed(2) : 0;

        return {
            km: Math.round(totalKm),
            valves: serviceEvents,
            maxSpeed,
            efficiency
        };
    } catch (error) {
        console.error("Error in generateStats:", error);
        return { km: 0, valves: 0, maxSpeed: 0, efficiency: 0 };
    }
};

const SidebarTab = ({ id, icon, label, active, set }) => (
    <button
        onClick={() => set(id)}
        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wide flex flex-col items-center gap-1 transition-colors border-b-2 ${active === id ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
    >
        {icon} {label}
    </button>
);

const UnitCard = ({ id, name, color, visible, toggle, stats, mode, tab, alert }) => (
    <div className={`bg-white rounded border transition-all ${alert ? 'border-red-500 ring-2 ring-red-100' : visible ? 'border-slate-200 shadow-sm' : 'border-slate-100 opacity-60 grayscale'}`}>
        <div className="p-3 border-b border-slate-50 flex justify-between items-center">
            <div className={`border-l-2 pl-2 ${color.replace('border', 'border-l')}`}>
                <h4 className="text-sm font-bold text-slate-700">{name}</h4>
                {alert && <span className="text-[10px] font-bold text-red-600 animate-pulse">ALERTA ACTIVIDAD</span>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); toggle(); }} className="text-slate-400 hover:text-indigo-600">
                {visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
        </div>

        {visible && (
            <div className="p-3 space-y-2">
                {tab === 'operations' && (
                    <>
                        <StatRow label="Recorrido" value={`${stats.km} km`} />
                        <StatRow label="Ventas (Servicios)" value={stats.valves} />
                    </>
                )}
                {tab === 'safety' && (
                    <>
                        <StatRow label="Vel. Máx" value={`${stats.maxSpeed} km/h`} alert={stats.maxSpeed > 80} />
                        <StatRow label="Infracciones" value={mode === 'period' ? Math.round(stats.km * 0.02) : (stats.maxSpeed > 80 ? 1 : 0)} />
                    </>
                )}
                {tab === 'commercial' && (
                    <>
                        <StatRow label="Ventas Totales" value={stats.valves} />
                        <StatRow label="Eficiencia" value={stats.efficiency} sub="(Ventas/Km)" />
                    </>
                )}
            </div>
        )}
    </div>
);

const StatRow = ({ label, value, sub, alert }) => (
    <div className="flex justify-between items-baseline text-xs">
        <span className="text-slate-500">{label} {sub && <span className="text-[9px] opacity-75">{sub}</span>}</span>
        <span className={`font-mono font-bold ${alert ? 'text-red-600' : 'text-slate-700'}`}>{value}</span>
    </div>
);

const TimelineTrack = ({ id, color, points, visible }) => {
    if (!visible || !points || points.length === 0) return null;

    const normalize = (ts) => {
        const d = new Date(ts);
        const m = d.getHours() * 60 + d.getMinutes();
        return Math.max(0, Math.min(100, ((m - 360) / 720) * 100));
    };

    return (
        <div className="h-4 bg-slate-100 rounded w-full relative overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 px-2 flex items-center text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/50">{id}</div>

            {points.map((p, i) => {
                if (i === 0) return null;
                const start = normalize(points[i - 1].ts);
                const width = normalize(p.ts) - start;

                let bgClass = 'bg-slate-300';
                if (p.valve) {
                    bgClass = 'bg-emerald-500';
                } else if (p.speed > 80) {
                    bgClass = 'bg-red-600';
                } else if (p.speed > 0) {
                    bgClass = 'bg-blue-500';
                }

                return <div key={i} className={`absolute h-full ${bgClass}`} style={{ left: `${start}%`, width: `${width}%` }} />;
            })}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-900 h-screen overflow-auto">
                    <h1 className="text-2xl font-bold mb-4">Algo salió mal</h1>
                    <p className="font-bold">{this.state.error && this.state.error.toString()}</p>
                    <pre className="mt-4 p-4 bg-red-100 rounded text-xs font-mono whitespace-pre-wrap">
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

function UbiSmartSimulatorV3() {
    const [viewMode, setViewMode] = useState('daily');
    const [activeTab, setActiveTab] = useState('operations');
    const [dayIndex, setDayIndex] = useState(dateKeys.length - 1);
    const [visibilities, setVisibilities] = useState({ pipa_1: true, pipa_2: true, pipa_3: true });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackProgress, setPlaybackProgress] = useState(100);
    const [hoverTime, setHoverTime] = useState(null);

    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const layersRef = useRef({ polylines: [], markers: [], ghosts: [], grid: [] });
    const animationRef = useRef(null);

    // --- PLAYBACK ---
    useEffect(() => {
        if (isPlaying && viewMode === 'daily') {
            animationRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animationRef.current);
        }
        return () => cancelAnimationFrame(animationRef.current);
    }, [isPlaying, viewMode]);

    const animate = () => {
        setPlaybackProgress(prev => {
            if (prev >= 100) { setIsPlaying(false); return 100; }
            return prev + 0.2;
        });
        animationRef.current = requestAnimationFrame(animate);
    };

    // --- LEAFLET ---
    useEffect(() => {
        // Inicializar mapa
        const initMap = () => {
            if (mapInstanceRef.current || !mapRef.current || !window.L) return;

            try {
                const map = window.L.map(mapRef.current, { zoomControl: false }).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
                window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
                window.L.control.zoom({ position: 'topright' }).addTo(map);
                mapInstanceRef.current = map;

                // Marcador de Planta
                const baseIcon = window.L.divIcon({
                    html: '<div style="background:#334155; width:14px; height:14px; border-radius:2px; border:2px solid white;"></div>',
                    className: ''
                });
                window.L.marker([PLANTA_CENTRAL.lat, PLANTA_CENTRAL.lon], { icon: baseIcon }).addTo(map).bindPopup("Planta Central");

                renderMap();
            } catch (error) {
                console.error("Error initializing map:", error);
            }
        };

        // Pequeño delay para asegurar que el contenedor esté listo y Leaflet cargado
        const timer = setTimeout(initMap, 100);

        return () => {
            clearTimeout(timer);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                layersRef.current = { polylines: [], markers: [], ghosts: [], grid: [] };
            }
        };
    }, []);

    // --- RENDER MAPA ---
    useEffect(() => {
        try {
            renderMap();
        } catch (e) {
            console.error("Error rendering map:", e);
        }
    }, [viewMode, activeTab, dayIndex, visibilities, playbackProgress, hoverTime]);

    const renderMap = () => {
        if (!mapInstanceRef.current || !window.L) return;
        const map = mapInstanceRef.current;
        const L = window.L;

        Object.values(layersRef.current).forEach(group => group.forEach(l => l.remove()));
        layersRef.current = { polylines: [], markers: [], ghosts: [], grid: [] };

        Object.values(GEOFENCES).forEach(geo => {
            if (!visibilities[`pipa_${geo.id.slice(1)}`]) return;
            const poly = L.rectangle(
                [[geo.bounds[0], geo.bounds[1]], [geo.bounds[2], geo.bounds[3]]],
                { color: geo.color, weight: 1, fillOpacity: 0.03, dashArray: '4' }
            ).addTo(map);
            layersRef.current.grid.push(poly);
        });

        const currentDayKey = dateKeys[dayIndex];

        if (viewMode === 'daily') {
            ['pipa_1', 'pipa_2', 'pipa_3'].forEach(pid => {
                if (!visibilities[pid]) return;
                const points = SIM_DATA[pid][currentDayKey] || [];
                if (points.length === 0) return;

                const geoConf = GEOFENCES[pid === 'pipa_1' ? 'G1' : pid === 'pipa_2' ? 'G2' : 'G3'];
                const limitIndex = Math.floor((playbackProgress / 100) * (points.length - 1));
                const visiblePoints = points.slice(0, limitIndex + 1);

                if (visiblePoints.length > 0) {
                    const latlngs = visiblePoints.map(p => [p.lat, p.lon]);
                    const line = L.polyline(latlngs, { color: geoConf.color, weight: 4, opacity: 0.8 }).addTo(map);
                    layersRef.current.polylines.push(line);

                    const lastPt = visiblePoints[visiblePoints.length - 1];
                    const headMarker = L.circleMarker([lastPt.lat, lastPt.lon], {
                        radius: 5, color: 'white', weight: 2, fillColor: geoConf.color, fillOpacity: 1
                    }).addTo(map);
                    layersRef.current.markers.push(headMarker);

                    visiblePoints.forEach(p => {
                        // Alerta en Mapa: Coincidir color con Timeline (Rojo)
                        if (activeTab === 'safety' && p.speed > 80) {
                            L.circleMarker([p.lat, p.lon], { radius: 4, color: 'black', fillColor: '#dc2626', fillOpacity: 1 }).addTo(map);
                        }
                        if (activeTab === 'commercial' && p.valve) {
                            L.circleMarker([p.lat, p.lon], { radius: 3, color: 'transparent', fillColor: '#10b981', fillOpacity: 0.8 }).addTo(map);
                        }
                    });
                }

                if (hoverTime && points.length > 0) {
                    const hoverIdx = Math.floor((hoverTime / 100) * (points.length - 1));
                    const ghostPt = points[hoverIdx];
                    if (ghostPt) {
                        const ghost = L.circleMarker([ghostPt.lat, ghostPt.lon], {
                            radius: 6, color: geoConf.color, weight: 1, fillColor: 'transparent', dashArray: '2,2'
                        }).addTo(map);
                        layersRef.current.ghosts.push(ghost);
                    }
                }
            });
        }

        if (viewMode === 'period') {
            ['pipa_1', 'pipa_2', 'pipa_3'].forEach(pid => {
                if (!visibilities[pid]) return;
                const geoConf = GEOFENCES[pid === 'pipa_1' ? 'G1' : pid === 'pipa_2' ? 'G2' : 'G3'];

                if (activeTab !== 'commercial') {
                    dateKeys.forEach(date => {
                        const pts = SIM_DATA[pid][date];
                        if (!pts || pts.length === 0) return;
                        const latlngs = pts.map(p => [p.lat, p.lon]);
                        const line = L.polyline(latlngs, { color: geoConf.color, weight: 1, opacity: 0.05 }).addTo(map);
                        layersRef.current.polylines.push(line);
                    });
                }

                dateKeys.forEach(date => {
                    const pts = SIM_DATA[pid][date];
                    if (!pts) return;
                    pts.forEach(p => {
                        if (activeTab === 'commercial' && p.valve) {
                            L.circleMarker([p.lat, p.lon], { radius: 2, stroke: false, fillColor: geoConf.color, fillOpacity: 0.3 }).addTo(map);
                        }
                        if (activeTab === 'safety' && p.speed > 80) {
                            L.circleMarker([p.lat, p.lon], { radius: 3, stroke: false, fillColor: '#dc2626', fillOpacity: 0.5 }).addTo(map);
                        }
                    });
                });
            });
        }
    };

    const handleTimelineHover = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percent = Math.max(0, Math.min(100, (x / width) * 100));
        setHoverTime(percent);
    };

    const handleTimelineLeave = () => setHoverTime(null);

    return (
        <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-800">

            <header className="flex-none bg-white border-b border-slate-200 px-4 py-3 shadow-sm z-50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 text-white p-1.5 rounded">
                        <Truck size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold leading-none">Ubi Smart <span className="font-normal text-slate-500">by Ubiqo</span></h1>
                    </div>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                        onClick={() => { setViewMode('daily'); setPlaybackProgress(100); setIsPlaying(false); }}
                        className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'daily' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                    >
                        <Clock size={14} /> Vista Diaria
                    </button>
                    <button
                        onClick={() => setViewMode('period')}
                        className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'period' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                    >
                        <BarChart2 size={14} /> Análisis Mensual
                    </button>
                </div>

                <div className={`flex items-center gap-2 transition-opacity ${viewMode === 'period' ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    <button onClick={() => setDayIndex(Math.max(0, dayIndex - 1))} className="p-1 hover:bg-slate-100 rounded"><ChevronLeft size={16} /></button>
                    <div className="bg-white border px-3 py-1 rounded text-sm font-mono flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        {dateKeys[dayIndex]}
                    </div>
                    <button onClick={() => setDayIndex(Math.min(dateKeys.length - 1, dayIndex + 1))} className="p-1 hover:bg-slate-100 rounded"><ChevronRight size={16} /></button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">

                <aside className="w-80 bg-white border-r border-slate-200 flex flex-col z-40 shadow-xl">
                    <div className="flex border-b border-slate-100">
                        <SidebarTab id="safety" icon={<ShieldAlert size={16} />} label="Auditoría" active={activeTab} set={setActiveTab} />
                        <SidebarTab id="commercial" icon={<DollarSign size={16} />} label="Ventas" active={activeTab} set={setActiveTab} />
                        <SidebarTab id="operations" icon={<Activity size={16} />} label="Operación" active={activeTab} set={setActiveTab} />
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                        <UnitCard
                            id="pipa_1" name="Zona Norte" color="border-emerald-500"
                            visible={visibilities.pipa_1}
                            toggle={() => setVisibilities(prev => ({ ...prev, pipa_1: !prev.pipa_1 }))}
                            stats={generateStats('pipa_1', viewMode, dayIndex, SIM_DATA)}
                            mode={viewMode} tab={activeTab}
                        />
                        <UnitCard
                            id="pipa_2" name="Zona Este" color="border-blue-500"
                            visible={visibilities.pipa_2}
                            toggle={() => setVisibilities(prev => ({ ...prev, pipa_2: !prev.pipa_2 }))}
                            stats={generateStats('pipa_2', viewMode, dayIndex, SIM_DATA)}
                            mode={viewMode} tab={activeTab}
                        />
                        <UnitCard
                            id="pipa_3" name="Zona Sur" color="border-red-500"
                            visible={visibilities.pipa_3}
                            toggle={() => setVisibilities(prev => ({ ...prev, pipa_3: !prev.pipa_3 }))}
                            stats={generateStats('pipa_3', viewMode, dayIndex, SIM_DATA)}
                            mode={viewMode} tab={activeTab}
                            alert={false}
                        />
                    </div>
                </aside>

                <main className="flex-1 relative bg-slate-200 z-0">
                    <div ref={mapRef} className="absolute inset-0 w-full h-full" />

                    {viewMode === 'daily' && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-200 z-[400] flex items-center gap-4">
                            <button
                                onClick={() => {
                                    if (playbackProgress >= 100) setPlaybackProgress(0);
                                    setIsPlaying(!isPlaying);
                                }}
                                className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <input
                                type="range" min="0" max="100" step="0.1"
                                value={playbackProgress}
                                onChange={(e) => { setIsPlaying(false); setPlaybackProgress(parseFloat(e.target.value)); }}
                                className="w-48 accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                            />
                            <span className="text-xs font-mono w-12 text-right text-slate-600">{Math.round(playbackProgress)}%</span>
                        </div>
                    )}

                    <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur px-4 py-3 rounded shadow border border-slate-200 text-xs space-y-2 z-[400]">
                        <h5 className="font-bold text-slate-700 border-b pb-1 mb-2">Simbología ({activeTab === 'safety' ? 'Auditoría' : activeTab === 'commercial' ? 'Comercial' : 'Operativa'})</h5>
                        {activeTab === 'operations' && (
                            <>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full border border-white shadow-sm"></div> Válvula Abierta (Venta)</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> En Traslado</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-600 rounded-sm"></div> Alerta / Exceso Vel.</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-300 rounded-sm"></div> Detenido / T. Muerto</div>
                            </>
                        )}
                        {activeTab === 'safety' && (
                            <>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-600 rounded-full border border-black"></div> Exceso Velocidad {'>'} 80 km/h</div>
                                <div className="flex items-center gap-2"><div className="w-6 h-1 bg-slate-500 opacity-50"></div> Ruta</div>
                            </>
                        )}
                        {activeTab === 'commercial' && (
                            <>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 opacity-50 rounded-full"></div> Densidad de Venta</div>
                                {viewMode === 'period' && <div className="text-[10px] text-slate-500 mt-1 italic">Modo Tendencia: Muestra acumulado</div>}
                            </>
                        )}
                    </div>
                </main>
            </div>

            {viewMode === 'daily' && (
                <div className="h-32 bg-white border-t border-slate-200 px-6 py-4 z-50 flex flex-col shrink-0 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)]">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Clock size={14} /> Cronología Operativa (06:00 - 18:00)
                        </h3>
                        {hoverTime !== null && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">
                                Sincronizando Mapa: {Math.round(hoverTime)}%
                            </span>
                        )}
                    </div>

                    <div
                        className="flex-1 space-y-3 relative cursor-crosshair"
                        onMouseMove={handleTimelineHover}
                        onMouseLeave={handleTimelineLeave}
                    >
                        <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-600 z-20 pointer-events-none transition-all duration-75" style={{ left: `${playbackProgress}%` }} />
                        {hoverTime !== null && (
                            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10 pointer-events-none border-l border-dashed border-slate-800 opacity-50" style={{ left: `${hoverTime}%` }} />
                        )}

                        <TimelineTrack id="pipa_1" color="bg-emerald-500" points={SIM_DATA.pipa_1[dateKeys[dayIndex]]} visible={visibilities.pipa_1} />
                        <TimelineTrack id="pipa_2" color="bg-blue-500" points={SIM_DATA.pipa_2[dateKeys[dayIndex]]} visible={visibilities.pipa_2} />
                        <TimelineTrack id="pipa_3" color="bg-red-500" points={SIM_DATA.pipa_3[dateKeys[dayIndex]]} visible={visibilities.pipa_3} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <UbiSmartSimulatorV3 />
        </ErrorBoundary>
    );
}
