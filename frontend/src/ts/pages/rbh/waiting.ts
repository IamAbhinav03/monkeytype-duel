import Page from "../page";
import { qsr } from "../../utils/dom";

export const page = new Page({
  id: "waiting",
  element: qsr(".page.pageWaiting"),
  path: "/waiting",
});
