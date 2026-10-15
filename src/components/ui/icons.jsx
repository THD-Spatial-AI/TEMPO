// Material Symbols icon set (same as the landing page), bundled via the
// `material-symbols` package so icons render offline in Electron.
//
// Exports keep the old Feather names (FiHome, FiX, ...) so call sites stay
// unchanged: `<FiX size={14} className="..." />` and `Icon={FiHome}` both work.
import React from 'react';

const make = (name) => {
  const Icon = ({ size, className = '', style, ...rest }) => {
    // Feather sized itself with `size` or w-N/h-N classes; map both to font-size.
    let fontSize;
    if (size != null) fontSize = typeof size === 'number' ? `${size}px` : size;
    else {
      const m = className.match(/(?:^|\s)(?:w|size)-(\d+(?:\.5)?)(?:\s|$)/);
      if (m) fontSize = `${parseFloat(m[1]) * 0.25}rem`;
    }
    return (
      <span
        aria-hidden="true"
        {...rest}
        className={`material-symbols-outlined tempo-icon ${className}`}
        style={fontSize ? { fontSize, ...style } : style}
      >
        {name}
      </span>
    );
  };
  Icon.displayName = name;
  return Icon;
};

export const FiActivity = make('timeline');
export const FiAlertCircle = make('error');
export const FiAlertTriangle = make('warning');
export const FiArrowDown = make('arrow_downward');
export const FiArrowRight = make('arrow_forward');
export const FiArrowUp = make('arrow_upward');
export const FiAward = make('workspace_premium');
export const FiBarChart2 = make('bar_chart');
export const FiBattery = make('battery_full');
export const FiBook = make('menu_book');
export const FiBox = make('deployed_code');
export const FiCalendar = make('calendar_today');
export const FiCheck = make('check');
export const FiCheckCircle = make('check_circle');
export const FiCheckSquare = make('check_box');
export const FiChevronDown = make('keyboard_arrow_down');
export const FiChevronLeft = make('chevron_left');
export const FiChevronRight = make('chevron_right');
export const FiChevronsRight = make('keyboard_double_arrow_right');
export const FiChevronUp = make('keyboard_arrow_up');
export const FiCircle = make('radio_button_unchecked');
export const FiClock = make('schedule');
export const FiCloud = make('cloud');
export const FiCopy = make('content_copy');
export const FiCpu = make('memory');
export const FiCrosshair = make('my_location');
export const FiDatabase = make('database');
export const FiDollarSign = make('attach_money');
export const FiDownload = make('download');
export const FiDownloadCloud = make('cloud_download');
export const FiDroplet = make('water_drop');
export const FiEdit = make('edit_square');
export const FiEdit2 = make('edit');
export const FiEdit3 = make('edit_note');
export const FiExternalLink = make('open_in_new');
export const FiEye = make('visibility');
export const FiFile = make('draft');
export const FiFileText = make('description');
export const FiFilter = make('filter_alt');
export const FiFolder = make('folder');
export const FiGitMerge = make('merge');
export const FiGlobe = make('public');
export const FiGrid = make('grid_view');
export const FiHelpCircle = make('help');
export const FiHome = make('home');
export const FiInfo = make('info');
export const FiLayers = make('layers');
export const FiLink = make('link');
export const FiList = make('list');
export const FiLoader = make('progress_activity');
export const FiMap = make('map');
export const FiMapPin = make('location_on');
export const FiMaximize2 = make('open_in_full');
export const FiMessageSquare = make('chat');
export const FiMinimize2 = make('close_fullscreen');
export const FiNavigation = make('near_me');
export const FiPackage = make('package_2');
export const FiPieChart = make('pie_chart');
export const FiPlay = make('play_arrow');
export const FiPlus = make('add');
export const FiRefreshCw = make('refresh');
export const FiSave = make('save');
export const FiSearch = make('search');
export const FiSend = make('send');
export const FiServer = make('dns');
export const FiSettings = make('settings');
export const FiShare2 = make('share');
export const FiShield = make('shield');
export const FiSliders = make('tune');
export const FiSquare = make('check_box_outline_blank');
export const FiStar = make('star');
export const FiStopCircle = make('stop_circle');
export const FiSun = make('sunny');
export const FiTerminal = make('terminal');
export const FiTrash2 = make('delete');
export const FiTrendingUp = make('trending_up');
export const FiUpload = make('upload');
export const FiUploadCloud = make('cloud_upload');
export const FiWind = make('air');
export const FiX = make('close');
export const FiZap = make('bolt');
export const FiZoomIn = make('zoom_in');
export const FiZoomOut = make('zoom_out');

// Lucide-named aliases used by the redesigned screens
export const LuLayoutDashboard = make('dashboard');
export const LuFactory = make('factory');
export const LuGauge = make('speed');
export const LuWaypoints = make('route');
export const LuCoins = make('paid');
export const LuChartLine = make('show_chart');
export const LuPanelLeftClose = make('left_panel_close');
export const LuPanelLeftOpen = make('left_panel_open');
export const LuPanelRightClose = make('right_panel_close');
export const LuPanelRightOpen = make('right_panel_open');
export const LuPencil = make('edit');
export const LuTrash2 = make('delete');
export const LuCheck = make('check');
export const LuX = make('close');
export const LuPlus = make('add');
export const LuSearch = make('search');
export const LuLink = make('link');
export const LuArrowRight = make('arrow_forward');
export const LuRuler = make('straighten');
export const LuZap = make('bolt');
export const LuChevronDown = make('expand_more');
export const LuChevronRight = make('chevron_right');
export const LuChevronLeft = make('chevron_left');
export const LuChevronsLeft = make('keyboard_double_arrow_left');
export const LuChevronsRight = make('keyboard_double_arrow_right');
export const LuCpu = make('memory');
export const LuSun = make('light_mode');
export const LuWind = make('air');
export const LuBatteryCharging = make('battery_charging_full');
export const LuActivity = make('timeline');
export const LuDroplet = make('water_drop');
export const LuMapPin = make('location_on');
export const LuHouse = make('home');
export const LuCircle = make('circle');
export const LuCircleHelp = make('help');
export const LuSave = make('save');
export const LuLayers = make('layers');
export const LuInfo = make('info');
export const LuSlidersHorizontal = make('tune');
export const LuServer = make('dns');
export const LuMessageSquare = make('chat');
export const LuShield = make('shield');
export const LuListFilter = make('filter_list');
export const LuUpload = make('upload');
export const LuDownload = make('download');
export const LuCalendarClock = make('event');
export const LuColumns3 = make('view_column');
export const LuHash = make('tag');
export const LuCalendar = make('calendar_month');
export const LuRefreshCw = make('refresh');
export const LuArrowDown = make('arrow_downward');
export const LuArrowUp = make('arrow_upward');
export const LuArrowUpDown = make('swap_vert');
export const LuSparkles = make('auto_awesome');
export const LuBug = make('bug_report');
export const LuShieldCheck = make('verified_user');
export const LuWrench = make('build');
export const LuTag = make('sell');
export const LuExternalLink = make('open_in_new');
export const LuWifiOff = make('wifi_off');
export const LuGraduationCap = make('school');
export const LuPencilRuler = make('design_services');
export const LuFolderTree = make('account_tree');
export const LuBoxes = make('inventory_2');
export const LuMap = make('map');
export const LuDatabase = make('database');
export const LuFileDown = make('file_download');
export const LuCirclePlay = make('play_circle');
export const LuChartPie = make('pie_chart');
export const LuSettings = make('settings');
export const LuConversionPath = make('conversion_path');
export const LuAreaChart = make('area_chart');
export const LuEuro = make('euro');
export const LuPriceChange = make('price_change');
export const LuQueryStats = make('query_stats');
export const LuAltRoute = make('alt_route');
export const LuTerminal = make('terminal');
export const FiBookOpen = make('menu_book');
export const FiMaximize = make('fullscreen');
export const FiMinus = make('remove');
