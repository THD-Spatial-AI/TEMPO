import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiChevronRight } from './ui/icons';
import { LuLayoutDashboard, LuGraduationCap, LuPencilRuler, LuFolderTree, LuBoxes, LuMap, LuMapPin, LuWaypoints, LuChartLine, LuLayers, LuDatabase, LuFileDown, LuCirclePlay, LuChartPie, LuSettings, LuPanelLeftClose, LuPanelLeftOpen, LuSparkles, LuTour } from './ui/icons';
import GuidedTour from './tour/GuidedTour';
import UpdateNotifier from './UpdateNotifier';
import { startTour, tourForView } from './tour/tour';
import WhatsNewDialog from "./WhatsNewDialog";
import { useData } from "../context/DataContext";
import { useReleases } from "../services/releases";
import { motion, AnimatePresence } from "framer-motion";
import tempoLogo from '../assets/Logo_TEMPO.PNG';

const WIDTH_OPEN = 240;
const WIDTH_CLOSED = 72;
const EASE = [0.4, 0, 0.2, 1];
const LABEL_TRANSITION = { duration: 0.18, ease: "easeOut" };

const Sidebar = ({ selected, setSelected }) => {
  const [open, setOpen] = useState(true);
  const [structureOpen, setStructureOpen] = useState(true);

  return (
    <motion.nav
      initial={false}
      animate={{ width: open ? WIDTH_OPEN : WIDTH_CLOSED }}
      transition={{ duration: 0.3, ease: EASE }}
      className="sticky top-0 h-screen shrink-0 overflow-hidden border-r border-black/15 bg-white/80 backdrop-blur-xl p-3  flex flex-col"
    >
      <TitleSection open={open} setSelected={setSelected} />

      <div className="space-y-1 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Option
          Icon={LuLayoutDashboard}
          title="Dashboard"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={LuGraduationCap}
          title="Tutorial"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={LuPencilRuler}
          title="Creation"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />

        {/* Structure Dropdown Section */}
        <DropdownSection
          Icon={LuFolderTree}
          title="Structure"
          open={open}
          setOpen={setOpen}
          isExpanded={structureOpen}
          setIsExpanded={setStructureOpen}
        >
          <Option
            Icon={LuBoxes}
            title="Models"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={LuMap}
            title="Map View"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={LuMapPin}
            title="Locations"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={LuWaypoints}
            title="Links"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={LuChartLine}
            title="TimeSeries"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={LuLayers}
            title="Scenarios"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
        </DropdownSection>

        <Option
          Icon={LuDatabase}
          title="Tech Database"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={LuFileDown}
          title="Export"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={LuCirclePlay}
          title="Run"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={LuChartPie}
          title="Results"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={LuSettings}
          title="Settings"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />

      </div>

      <RestartTourButton open={open} selected={selected} />
      <VersionButton open={open} />
      <ToggleClose open={open} setOpen={setOpen} />
      <GuidedTour view={selected} />
      <UpdateNotifier />
    </motion.nav>
  );
};

// Portal tooltip so the nav's overflow can't clip it.
const useCollapsedTooltip = (label, enabled) => {
  const [pos, setPos] = useState(null);
  const visible = enabled && pos;

  const show = (e) => {
    if (!enabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setPos(null);

  const tooltip = createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          role="tooltip"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="pointer-events-none fixed z-[100000] -translate-y-1/2 whitespace-nowrap rounded-lg bg-black px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-black" />
          {label}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return {
    tooltip,
    handlers: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide },
  };
};

const Label = ({ open, className = "", children }) => (
  <AnimatePresence initial={false}>
    {open && (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { ...LABEL_TRANSITION, delay: 0.1 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        className={`whitespace-nowrap ${className}`}
      >
        {children}
      </motion.span>
    )}
  </AnimatePresence>
);

const Option = ({ Icon, title, selected, setSelected, open, notifs, isNested = false }) => {
  const isSelected = selected === title;
  const { tooltip, handlers } = useCollapsedTooltip(title, !open);

  return (
    <>
      <motion.button
        onClick={() => setSelected(title)}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        aria-label={title}
        aria-current={isSelected ? "page" : undefined}
        {...handlers}
        className={`relative flex h-11 w-full items-center rounded-xl transition-colors duration-200 ${
          isSelected
            ? "bg-gradient-to-r from-electric-500 to-electric-600 text-white "
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        } ${isNested ? "pl-5" : "pl-0.5"}`}
      >
        <div className="grid h-full w-11 shrink-0 place-content-center text-lg">
          <Icon className={isSelected ? "drop-shadow" : ""} />
        </div>
        <Label open={open} className={`text-sm font-medium ${isSelected ? "font-semibold" : ""}`}>
          {title}
        </Label>

        {notifs && open && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            style={{ y: "-50%" }}
            transition={{ delay: 0.5, type: "spring" }}
            className="absolute right-3 top-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-[10px] font-bold text-white "
          >
            {notifs}
          </motion.span>
        )}
      </motion.button>
      {tooltip}
    </>
  );
};

const DropdownSection = ({ Icon, title, open, setOpen, isExpanded, setIsExpanded, children }) => {
  const { tooltip, handlers } = useCollapsedTooltip(title, !open);

  const handleClick = () => {
    if (!open) {
      setOpen(true);
      setIsExpanded(true);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="my-1">
      <motion.button
        onClick={handleClick}
        whileHover={{ x: 2 }}
        aria-expanded={isExpanded}
        aria-label={title}
        {...handlers}
        className="relative flex h-11 w-full items-center rounded-xl pl-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-200"
      >
        <div className="grid h-full w-11 shrink-0 place-content-center text-lg">
          <Icon />
        </div>
        <Label open={open} className="text-sm font-medium flex-1 text-left">
          {title}
        </Label>
        {open && (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="mr-3"
          >
            <FiChevronRight size={16} className="text-slate-400" />
          </motion.div>
        )}
      </motion.button>
      {tooltip}

      <AnimatePresence initial={false}>
        {isExpanded && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden space-y-0.5 mt-1"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// With the desktop title bar showing the branding, the header becomes an active-model card.
const hasTitleBar = () => typeof window.electronAPI?.window?.state === 'function';

const ActiveModelCard = ({ open, setSelected }) => {
  const { models, currentModelId } = useData();
  const model = models.find((m) => m.id === currentModelId);
  const { tooltip, handlers } = useCollapsedTooltip(model ? `Active model: ${model.name}` : 'No model loaded', !open);
  return (
    <div className="mb-3 border-b border-black/15 pb-3">
      <button
        onClick={() => setSelected('Models')}
        {...handlers}
        className="flex w-full items-center gap-2.5 border border-black/10 bg-slate-50/80 py-2 pl-2 pr-2.5 text-left transition-colors hover:border-black/20 hover:bg-white"
      >
        <span className={`grid h-8 w-8 shrink-0 place-items-center ${model ? 'bg-black text-white' : 'bg-slate-200 text-slate-500'}`}>
          <LuBoxes size={16} />
        </span>
        {open && (
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active model</span>
            <span className="block truncate text-[13px] font-semibold text-slate-900">{model ? model.name : 'No model loaded'}</span>
            {model && (
              <span className="block text-[11px] text-slate-500">
                {(model.locations || []).length} locations · {(model.links || []).length} links
              </span>
            )}
          </span>
        )}
      </button>
      {tooltip}
    </div>
  );
};

const TitleSection = ({ open, setSelected }) => {
  if (hasTitleBar()) return <ActiveModelCard open={open} setSelected={setSelected} />;
  return (
    <div className="mb-4 border-b border-black/15 pb-4">
      <div className="flex cursor-pointer items-center justify-between rounded-xl transition-colors duration-200 hover:bg-slate-50 py-2 pl-1 pr-2">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { ...LABEL_TRANSITION, delay: 0.1 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="w-[150px] shrink-0"
              >
                <span className="block text-sm font-bold bg-gradient-to-r from-electric-500 to-electric-900 bg-clip-text text-transparent">TEMPO</span>
                <span className="block text-[11px] text-slate-500 font-medium tracking-wide">Tool for Energy Model Planning and Optimization</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {open && <FiChevronDown className="mr-1 shrink-0 text-slate-400" size={16} />}
      </div>
    </div>
  );
};

const Logo = () => {
  return (
    <div className="shrink-0 size-10 flex items-center justify-center">
      <img
        src={tempoLogo}
        alt="TEMPO logo"
        className="h-10 w-10 object-contain"
        style={{ mixBlendMode: 'multiply' }}
      />
    </div>
  );
};

const RestartTourButton = ({ open, selected }) => {
  const tourId = tourForView(selected);
  useEffect(() => {
    const onTour = () => startTour(tourId);
    window.addEventListener('tempo:restart-tour', onTour);
    return () => window.removeEventListener('tempo:restart-tour', onTour);
  }, [tourId]);
  const scope = tourId === 'app' ? null : tourId;
  const { tooltip, handlers } = useCollapsedTooltip(scope ? `Restart ${scope} tour` : 'Restart tour', !open);
  return (
    <>
      <button
        onClick={() => startTour(tourId)}
        aria-label={scope ? `Restart ${scope} tour` : 'Restart tour'}
        data-tour="restart-tour"
        {...handlers}
        className="mt-3 flex h-10 items-center rounded-xl pl-0.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <div className="grid h-full w-11 shrink-0 place-items-center">
          <LuTour size={18} />
        </div>
        <Label open={open} className="flex flex-1 items-center gap-2 pr-2 text-sm font-medium">
          Restart tour
          {scope && <span className="ml-auto border border-black/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{scope}</span>}
        </Label>
      </button>
      {tooltip}
    </>
  );
};

const VersionButton = ({ open }) => {
  const [showNotes, setShowNotes] = useState(false);
  useEffect(() => {
    const onOpen = () => setShowNotes(true);
    window.addEventListener('tempo:whats-new', onOpen);
    return () => window.removeEventListener('tempo:whats-new', onOpen);
  }, []);
  const releaseInfo = useReleases();
  const versionLabel = releaseInfo.latest ? `v${releaseInfo.latest.version}` : 'Release notes';
  const { tooltip, handlers } = useCollapsedTooltip(`${versionLabel} · What's new`, !open);

  return (
    <>
      <button
        onClick={() => setShowNotes(true)}
        aria-label={`${versionLabel} — what's new`}
        data-tour="version"
        {...handlers}
        className="flex h-10 items-center rounded-xl pl-0.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <div className="grid h-full w-11 shrink-0 place-items-center">
          <LuSparkles size={17} strokeWidth={1.75} />
        </div>
        <Label open={open} className="flex flex-1 items-center gap-2 pr-2 text-sm">
          <span className="font-medium">{versionLabel}</span>
          <span className="ml-auto bg-black px-2 py-0.5 text-[10px] font-semibold text-white">What's new</span>
        </Label>
      </button>
      {tooltip}
      <AnimatePresence>
        {showNotes && <WhatsNewDialog {...releaseInfo} onClose={() => setShowNotes(false)} />}
      </AnimatePresence>
    </>
  );
};

const ToggleClose = ({ open, setOpen }) => {
  const { tooltip, handlers } = useCollapsedTooltip("Expand sidebar", !open);
  const ToggleIcon = open ? LuPanelLeftClose : LuPanelLeftOpen;

  return (
    <>
      <button
        onClick={() => setOpen((pv) => !pv)}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        {...handlers}
        className="border-t border-black/15 pt-2"
      >
        <div className="flex h-11 items-center rounded-xl pl-0.5 text-slate-500 transition-colors duration-200 hover:bg-slate-50 hover:text-slate-900">
          <div className="grid h-full w-11 shrink-0 place-content-center">
            <ToggleIcon size={19} strokeWidth={1.75} />
          </div>
          <Label open={open} className="text-sm font-medium">
            Hide
          </Label>
        </div>
      </button>
      {tooltip}
    </>
  );
};

export default Sidebar;
