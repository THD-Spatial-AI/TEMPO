# Calliope Visualizator

A web-based platform for building, visualizing, and managing Calliope energy system models. This tool helps you design energy models through an interactive interface, manage technology templates, upload time series data, and visualize your model structure.

## What does it do?

- **Model Builder**: Create and configure Calliope energy system models with an intuitive interface
- **Technology Library**: Pre-configured templates for different energy technologies (solar, wind, batteries, etc.)
- **Time Series Management**: Upload and visualize CSV time series data with interactive charts
- **Structure Visualization**: Understand model components, carriers, and constraints through detailed tutorials
- **Data Export**: Download your models as YAML files ready to run in Calliope

## Tech Stack

Built with React + Vite for a fast development experience. Uses Apache ECharts for data visualization and Tailwind CSS for styling.

## Getting Started

### Prerequisites

Make sure you have Node.js installed (version 16 or higher recommended). Check with:

```bash
node --version
npm --version
```

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd calliope_visualizator
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The app should open at `http://localhost:5173`

### Building for Production

To create a production build:

```bash
npm run build
```

The optimized files will be in the `dist` folder.

To preview the production build locally:

```bash
npm run preview
```

## Project Structure

```
src/
├── components/         # React components
├── context/           # Global state management
├── data/              # Technology templates and static data
└── assets/            # Images and media files
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Using the Platform

1. **Create a Model**: Start by creating a new model with a name and description
2. **Add Locations**: Define geographic locations for your energy system
3. **Select Technologies**: Choose from pre-configured templates or create custom ones
4. **Upload Time Series**: Add CSV files with demand, generation, or price data
5. **Export**: Download your complete model as a YAML file

## Notes

- CSV files for time series should have headers in the first row
- Model configurations follow the Calliope framework specifications
- All data is stored locally in your browser (no backend required)

## Questions?

If something's not working or you have questions about using the platform, open an issue on GitLab.
