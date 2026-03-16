import React, { useState } from "react";
import {
  FiHome,
  FiMap,
  FiLayers,
  FiSettings,
  FiGrid,
  FiMapPin,
  FiActivity,
  FiChevronsRight,
  FiChevronDown,
  FiChevronRight,
  FiFolder,
  FiCpu,
  FiBarChart2,
  FiEdit,
  FiEdit3,
  FiBook,
  FiDownload,
  FiPlay,
  FiPieChart,
  FiZap,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";

const Sidebar = ({ selected, setSelected }) => {
  const [open, setOpen] = useState(true);
  const [structureOpen, setStructureOpen] = useState(true);

  return (
    <motion.nav
      layout
      className="sticky top-0 h-screen shrink-0 border-r border-slate-200 bg-white/80 backdrop-blur-xl p-3 shadow-sm flex flex-col"
      style={{
        width: open ? "240px" : "fit-content",
      }}
    >
      <TitleSection open={open} />

      <div className="space-y-1 flex-1 overflow-y-auto">
        <Option
          Icon={FiHome}
          title="Dashboard"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiBook}
          title="Tutorial"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiEdit}
          title="Creation"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        
        {/* Structure Dropdown Section */}
        <DropdownSection
          Icon={FiFolder}
          title="Structure"
          open={open}
          isExpanded={structureOpen}
          setIsExpanded={setStructureOpen}
        >
          <Option
            Icon={FiGrid}
            title="Models"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiMap}
            title="Map View"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiSettings}
            title="Configuration"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiMapPin}
            title="Locations"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiActivity}
            title="Links"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiBarChart2}
            title="TimeSeries"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiEdit3}
            title="Overrides"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiLayers}
            title="Scenarios"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />        
        </DropdownSection>

        <Option
          Icon={FiCpu}
          title="Technologies"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiDownload}
          title="Export"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />        
        <Option
          Icon={FiPlay}
          title="Run"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiPieChart}
          title="Results"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiZap}
          title="H2 Plant"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiSettings}
          title="Settings"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />

      </div>

      <ToggleClose open={open} setOpen={setOpen} />
    </motion.nav>
  );
};

const Option = ({ Icon, title, selected, setSelected, open, notifs, isNested = false }) => {
  const isSelected = selected === title;
  
  return (
    <motion.button
      layout
      onClick={() => setSelected(title)}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      aria-label={title}
      aria-current={isSelected ? "page" : undefined}
      className={`relative flex h-11 w-full items-center rounded-xl transition-all duration-200 ${
        isSelected
          ? "bg-gradient-to-r from-electric-500 to-electric-600 text-white shadow-md"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      } ${isNested ? "pl-5" : "pl-1"}`}
    >
      <motion.div
        layout
        className="grid h-full w-11 place-content-center text-lg"
      >
        <Icon className={isSelected ? "drop-shadow" : ""} />
      </motion.div>
      {open && (
        <motion.span
          layout
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className={`text-sm font-medium ${isSelected ? "font-semibold" : ""}`}
        >
          {title}
        </motion.span>
      )}

      {notifs && open && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            opacity: 1,
            scale: 1,
          }}
          style={{ y: "-50%" }}
          transition={{ delay: 0.5, type: "spring" }}
          className="absolute right-3 top-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-solar-500 text-[10px] font-bold text-white shadow-sm"
        >
          {notifs}
        </motion.span>
      )}
    </motion.button>
  );
};

const DropdownSection = ({ Icon, title, open, isExpanded, setIsExpanded, children }) => {
  return (
    <div className="my-1">
      <motion.button
        layout
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ x: 2 }}
        aria-expanded={isExpanded}
        aria-label={title}
        className="relative flex h-11 w-full items-center rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
      >
        <motion.div
          layout
          className="grid h-full w-11 place-content-center text-lg"
        >
          <Icon />
        </motion.div>
        {open && (
          <>
            <motion.span
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="text-sm font-medium flex-1 text-left"
            >
              {title}
            </motion.span>
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="mr-3"
            >
              <FiChevronRight size={16} className="text-slate-400" />
            </motion.div>
          </>
        )}
      </motion.button>
      
      <AnimatePresence>
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

const TitleSection = ({ open }) => {
  return (
    <div className="mb-4 border-b border-slate-200 pb-4">
      <div className="flex cursor-pointer items-center justify-between rounded-xl transition-all duration-200 hover:bg-slate-50 p-2">
        <div className="flex items-center gap-3">
          <Logo />
          {open && (
            <motion.div
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            >
              <span className="block text-sm font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent">TEMPO</span>
              <span className="block text-[11px] text-slate-500 font-medium tracking-wide">Tool for Energy Model Planning and Optimization</span>
            </motion.div>
          )}
        </div>
        {open && <FiChevronDown className="mr-1 text-slate-400" size={16} />}
      </div>
    </div>
  );
};

const Logo = () => {
  return (
    <motion.div
      layout
      className="grid size-10 shrink-0 place-content-center rounded-md bg-gray-600"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 50 39"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="fill-slate-50"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M16.4992 2H37.5808L22.0816 24.9729H1L16.4992 2Z"
          stopColor="#000000"
        ></path>
        <path
          d="M17.4224 27.102L11.4192 36H33.5008L49 13.0271H32.7024L23.2064 27.102H17.4224Z"
          stopColor="#000000"
        ></path>
      </svg>
    </motion.div>
  );
};

const ToggleClose = ({ open, setOpen }) => {
  return (
    <motion.button
      layout
      onClick={() => setOpen((pv) => !pv)}
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      className="border-t border-slate-200 transition-all duration-200 hover:bg-slate-50 mt-3"
    >
      <div className="flex items-center p-2.5">
        <motion.div
          layout
          className="grid size-11 place-content-center text-lg"
        >
          <FiChevronsRight
            className={`transition-transform duration-300 text-slate-600 ${open && "rotate-180"}`}
          />
        </motion.div>
        {open && (
          <motion.span
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="text-sm font-medium text-slate-600"
          >
            Hide
          </motion.span>
        )}
      </div>
    </motion.button>
  );
};

export default Sidebar;
