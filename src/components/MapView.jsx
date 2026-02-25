import React from "react";
import MapDeckGL from "./MapDeckGL";

const MapView = () => {
  return (
    <div className="flex-1 h-screen overflow-hidden">
      <MapDeckGL />
    </div>
  );
};

export default MapView;
