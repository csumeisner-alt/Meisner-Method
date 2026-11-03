import React from "react";
import { createRoot } from "react-dom/client";
import HeatMapScreen from "../../app/heat-map";
import { initializeHeatMapBrowserState } from "./mocks/api-client-react";

initializeHeatMapBrowserState();

const root = document.getElementById("root");
if (!root) throw new Error("Heat-map browser test root was not found.");

createRoot(root).render(<HeatMapScreen />);