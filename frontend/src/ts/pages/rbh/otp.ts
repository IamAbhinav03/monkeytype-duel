import Page from "../page";
import { qsr } from "../../utils/dom";

function setupOtpInputs(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    ".pageOtp .otpDigit"
  );
  if (inputs.length === 0) return;

  inputs.forEach((input, index) => {
    // Handle input event - auto advance to next box
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const value = target.value;

      // Only allow digits
      if (value && !/^\d$/.test(value)) {
        target.value = "";
        return;
      }

      // If a digit was entered, move to next input
      if (value && index < inputs.length - 1) {
        inputs[index + 1]?.focus();
      }
    });

    // Handle keydown for backspace
    input.addEventListener("keydown", (e) => {
      const target = e.target as HTMLInputElement;

      // If backspace is pressed and current input is empty, go to previous
      if (e.key === "Backspace" && !target.value && index > 0) {
        inputs[index - 1]?.focus();
      }
    });

    // Select all text on focus for easier editing
    input.addEventListener("focus", (e) => {
      const target = e.target as HTMLInputElement;
      target.select();
    });
  });

  // Auto-focus first input when page loads
  inputs[0]?.focus();
}

export const page = new Page({
  id: "otp",
  element: qsr(".page.pageOtp"),
  path: "/otp",
  afterShow: async () => {
    setupOtpInputs();
  },
});
