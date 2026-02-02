import Page from "../page";
import { qsr } from "../../utils/dom";

import Config from "../../config";

export const page = new Page({
  id: "rbhProfile",
  element: qsr(".page#pageRbhProfile"),
  path: "/rbh/profile",
  afterShow: async () => {
    const themeValueEl = qsr("#profileThemeValue");
    let themeName: string = Config.theme;
    if (Config.customTheme) {
      themeName = "custom";
    }
    // Format theme name (replace underscores with spaces and capitalize words if needed, 
    // though CSS usually handles capitalization if text-transform is set, here we just replace underscores)
    themeValueEl.setText(themeName.replace(/_/g, " "));
  },
});
