import { qs } from "../utils/dom";
import { swapElements } from "../utils/misc";
import * as TribeStats from "./tribe-stats";

let active = "preloader";
let transition = false;

function forceSingleActivePage(page: string): void {
  $(".page.pageTribe .tribePage").removeClass("active").addClass("hidden");
  $(`.page.pageTribe .tribePage.${page}`)
    .removeClass("hidden")
    .addClass("active");
  active = page;
}

export async function change(
  page: string,
  // These were commented because no value was passed to them in the entire use of this function
  // middleCallback = (() => { /* noop */ }),
  // finishCallback = () => { }
): Promise<void> {
  return new Promise((resolve, _reject) => {
    if (transition) {
      setTimeout(() => {
        void change(page).then(() => {
          resolve();
        });
      }, 25);
      return;
    }

    if (page === active) {
      forceSingleActivePage(page);
      resolve();
      return;
    }

    transition = true;

    const activePage = qs(".page.pageTribe .tribePage.active");
    const newPageEl = qs(`.page.pageTribe .tribePage.${page}`);

    if (newPageEl === null) {
      transition = false;
      resolve();
      return;
    }

    if (activePage === null) {
      forceSingleActivePage(page);
      transition = false;
      if (page === "menu") {
        void TribeStats.refresh();
      }
      resolve();
      return;
    }

    void swapElements(
      activePage,
      newPageEl,
      250,
      async () => {
        forceSingleActivePage(page);
        transition = false;
        // await finishCallback();
        if (page === "menu") {
          await TribeStats.refresh();
        }
        resolve();
      },
      async () => {
        // middleCallback();
      },
    );
  });
}
