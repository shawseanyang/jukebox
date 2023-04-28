import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Playback from "./pages/Playback";
import './App.css';
import { ConfigProvider } from "antd";

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "Inter",
          fontSizeHeading1: 25,
          fontSizeHeading2: 20,
          fontSizeHeading3: 16,
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="/playback" element={<Playback />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}