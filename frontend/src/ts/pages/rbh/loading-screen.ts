import Page from "../page";
import { qsr } from "../../utils/dom";

export const page = new Page({
  id: "rbhLoadingScreen",
  element: qsr(".page#pageRbhLoadingScreen"),
  path: "/rbh/loading-screen",
});
