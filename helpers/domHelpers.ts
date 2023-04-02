export function findClosestForm(element: Element): HTMLFormElement | null {
  if (element.tagName.toLowerCase() === 'form') {
    return element as HTMLFormElement;
  }

  if (element.parentElement) {
    return findClosestForm(element.parentElement);
  }

  return null;
}

export function fill(cssSelector: string, value: string): boolean {
  const element = document.querySelector(cssSelector);

  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  const typeAttribute = (element as HTMLInputElement).type;

  if (tagName === 'input' && typeAttribute === 'text') {
    (element as HTMLInputElement).value = value as string;
    return true;
  } else if (tagName === 'textarea') {
    (element as HTMLTextAreaElement).value = value as string;
    return true;
  } else if (tagName === 'select') {
    (element as HTMLSelectElement).value = value as string;
    return true;
  } else if (tagName === 'input' && typeAttribute === 'radio') {
    const form = findClosestForm(element);
    const radioName = (element as HTMLInputElement).name;

    if (form) {
      const radioGroup = form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${radioName}"]`);

      radioGroup.forEach((radio) => {
        if (radio.value === value) {
          radio.checked = true;
        }
      });
      return true;
    } else {
      console.error(`No form found for radio button with selector: ${cssSelector}`);
      return false;
    }
  } else if (tagName === 'input' && typeAttribute === 'checkbox') {
    (element as HTMLInputElement).checked = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 't' || value.toLowerCase() === 'on';
    return true;
  } else {
    try {
      (element as HTMLInputElement).value = value as string;
      return true;
    } catch (e) {
      console.error(`Failed to fill element with selector: ${cssSelector}`);
      return false;
    }
  }
}
