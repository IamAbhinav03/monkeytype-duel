// OTP authentication page
// Allows user to enter their 6-digit code for authentication
// This is the ONLY way to proceed - no bypass allowed

import * as DuelState from "../duel/duel-state";

// Callbacks
let onAuthenticateCallback: ((otp: string) => Promise<boolean>) | null = null;

/**
 * Get the combined OTP value from all 6 digit inputs.
 */
function getOtpValue(): string {
  let otp = "";
  $(".pageTribe .tribePage.otp .otpDigit").each(function () {
    otp += ($(this).val() as string) || "";
  });
  return otp;
}

/**
 * Clear all OTP digit inputs.
 */
function clearOtpInputs(): void {
  $(".pageTribe .tribePage.otp .otpDigit").val("");
}

/**
 * Initialize the OTP page event handlers.
 * @param onAuthenticate - Callback when OTP is submitted, returns true if successful
 */
export function init(onAuthenticate: (otp: string) => Promise<boolean>): void {
  onAuthenticateCallback = onAuthenticate;

  // Update side label
  updateSideLabel();

  // OTP digit input handlers
  $(".pageTribe .tribePage.otp .otpDigit")
    .off("input")
    .on("input", function () {
      const input = $(this);
      const value = input.val() as string;
      const index = parseInt(input.data("index") as string, 10);

      // Only allow digits
      if (value && !/^\d$/.test(value)) {
        input.val("");
        return;
      }

      // Auto-advance to next input
      if (value && index < 5) {
        const nextInput = $(
          `.pageTribe .tribePage.otp .otpDigit[data-index="${index + 1}"]`,
        );
        nextInput.trigger("focus");
      }

      // Auto-submit when all 6 digits entered
      const fullOtp = getOtpValue();
      if (fullOtp.length === 6) {
        void submitOtp();
      }
    });

  // Handle keydown for backspace navigation
  $(".pageTribe .tribePage.otp .otpDigit")
    .off("keydown")
    .on("keydown", function (e) {
      const input = $(this);
      const index = parseInt(input.data("index") as string, 10);

      if (e.key === "Backspace") {
        if (input.val() === "" && index > 0) {
          // Move to previous input on backspace when empty
          const prevInput = $(
            `.pageTribe .tribePage.otp .otpDigit[data-index="${index - 1}"]`,
          );
          prevInput.trigger("focus").val("");
          e.preventDefault();
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        const prevInput = $(
          `.pageTribe .tribePage.otp .otpDigit[data-index="${index - 1}"]`,
        );
        prevInput.trigger("focus");
        e.preventDefault();
      } else if (e.key === "ArrowRight" && index < 5) {
        const nextInput = $(
          `.pageTribe .tribePage.otp .otpDigit[data-index="${index + 1}"]`,
        );
        nextInput.trigger("focus");
        e.preventDefault();
      } else if (e.key === "Enter") {
        void submitOtp();
        e.preventDefault();
      }
    });

  // Handle paste - distribute digits across inputs
  $(".pageTribe .tribePage.otp .otpDigit")
    .off("paste")
    .on("paste", function (e) {
      e.preventDefault();
      const clipboardData = (e.originalEvent as ClipboardEvent | undefined)
        ?.clipboardData;
      if (clipboardData === null || clipboardData === undefined) return;

      const pastedText: string = clipboardData
        .getData("text")
        .replace(/\D/g, "");
      if (pastedText === "") return;

      // Distribute pasted digits across inputs
      const digits: string[] = pastedText.slice(0, 6).split("");
      digits.forEach((digit: string, i: number) => {
        $(`.pageTribe .tribePage.otp .otpDigit[data-index="${i}"]`).val(digit);
      });

      // Focus appropriate input
      if (digits.length >= 6) {
        $(`.pageTribe .tribePage.otp .otpDigit[data-index="5"]`).trigger(
          "focus",
        );
        // Auto-submit
        void submitOtp();
      } else {
        $(
          `.pageTribe .tribePage.otp .otpDigit[data-index="${digits.length}"]`,
        ).trigger("focus");
      }
    });

  // Form submit handler
  $(".pageTribe .tribePage.otp form")
    .off("submit")
    .on("submit", function (e) {
      e.preventDefault();
      void submitOtp();
    });
}

/**
 * Submit the OTP for authentication.
 */
async function submitOtp(): Promise<void> {
  const otp = getOtpValue();

  if (otp.length !== 6) {
    showError("Please enter all 6 digits");
    return;
  }

  // Disable form during authentication
  setLoading(true);
  hideError();

  if (onAuthenticateCallback) {
    const success = await onAuthenticateCallback(otp);
    if (!success) {
      // Clear inputs on failure so user must re-enter
      clearOtpInputs();
      focusInput();
    }
  }

  setLoading(false);
}

/**
 * Update the side label to show current selected side.
 */
export function updateSideLabel(): void {
  const side = DuelState.getSide();
  $(".pageTribe .tribePage.otp .currentSide").text(`System ${side ?? "?"}`);
}

/**
 * Reset the page state.
 */
export function reset(): void {
  clearOtpInputs();
  updateSideLabel();
  setLoading(false);
  hideError();
}

/**
 * Set loading state (disable/enable form).
 */
export function setLoading(loading: boolean): void {
  if (loading) {
    $(".pageTribe .tribePage.otp .otpDigit").attr("disabled", "disabled");
    $(".pageTribe .tribePage.otp form .submitButton")
      .attr("disabled", "disabled")
      .html('<i class="fas fa-spinner fa-spin"></i> Authenticating...');
  } else {
    $(".pageTribe .tribePage.otp .otpDigit").removeAttr("disabled");
    $(".pageTribe .tribePage.otp form .submitButton")
      .removeAttr("disabled")
      .html('<i class="fas fa-sign-in-alt"></i> Authenticate');
  }
}

/**
 * Show an error message.
 */
export function showError(message: string): void {
  $(".pageTribe .tribePage.otp .errorMessage")
    .text(message)
    .removeClass("hidden");
}

/**
 * Hide any error message.
 */
export function hideError(): void {
  $(".pageTribe .tribePage.otp .errorMessage").addClass("hidden");
}

/**
 * Focus the first OTP input field.
 */
export function focusInput(): void {
  $(".pageTribe .tribePage.otp .otpDigit[data-index='0']").trigger("focus");
}
