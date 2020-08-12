import React from "react";

import AvlMap from "./AvlMap"
import TransitLayerFactory from './layers/TransitLayer'

import './App.css';

function App() {
  return (
    <div className="App">
      <div style={ { height: "100vh" } }>
        <AvlMap
          dragPan={true}
          
          header="Transit Data"/>
      </div>
    </div>
  );
}

export default App;
