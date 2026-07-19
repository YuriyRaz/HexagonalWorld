# Hexagonal World

An interactive application for exploring arbitrary hierarchical information in 3D as a hexagonal spatial structure. Data entities are represented by cells, while their hierarchy, grouping, and relationships are expressed through the cells' position, height, color, and surrounding context.

The current version is a visual prototype built around a procedurally generated island. It establishes the navigation, selection, and rendering foundation for connecting real hierarchical datasets later.

![Hexagonal World](./hexagonal-world.png)

## Features

- Spatial representation of entities as hexagonal cells
- Interactive tile selection and hover states
- Orbit, pan, and zoom camera controls
- Responsive information panel for the selected entity
- Real-time lighting, shadows, fog, water, and ambient effects

## Project Direction

The application is intended to support datasets such as organizational structures, knowledge maps, project breakdowns, taxonomies, and other nested information. The visualization should remain independent of a specific domain: a data adapter maps source entities and their parent-child relationships into the common hexagonal scene model.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |

## Controls

- Left mouse button: rotate the camera
- Right mouse button: pan the camera
- Mouse wheel: zoom
- Click a hex: select a terrain tile
- Reset button: restore the default camera view

## Project Structure

```text
.
|-- index.html
|-- src/
|   |-- main.js
|   `-- style.css
|-- hexagonal-world.png
`-- package.json
```

## Technology

- [Three.js](https://threejs.org/)
- [Vite](https://vite.dev/)
