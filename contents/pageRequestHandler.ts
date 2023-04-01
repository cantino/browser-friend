import type { PlasmoMessaging } from "@plasmohq/messaging"
import { fill } from "~helpers/domHelpers";
import { getCssSelector } from 'css-selector-generator';

type AnalyzedFormElement = {
  cssSelector: string;
  elementType: string;
  name?: string;
  label?: string | null;
  placeholder?: string | null;
  title?: string | null;
};

function findLabelFor(element: HTMLElement): string | null {
  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      return label.textContent || null;
    }
  }
  return null;
}

function getFormElements(node: HTMLElement): AnalyzedFormElement[] {
  const elements: AnalyzedFormElement[] = [];
  const formElements = node.querySelectorAll('input, textarea, select');

  formElements.forEach((formElement: HTMLElement) => {
    const elementType = formElement.tagName.toLowerCase();
    const typeAttribute = (formElement as HTMLInputElement).type;
    const elementName = (formElement as HTMLInputElement).name;
    const placeholderAttribute = (formElement as HTMLInputElement).placeholder;
    const titleAttribute = formElement.title;

    let analyzedElementType = elementType;

    if (elementType === 'input' && ['checkbox', 'radio'].includes(typeAttribute)) {
      analyzedElementType = typeAttribute;
    }

    const label = findLabelFor(formElement);

    let newElement: AnalyzedFormElement = {
      cssSelector: getCssSelector(formElement),
      elementType: analyzedElementType,
    };

    if (elementName) newElement.name = elementName;
    if (label) newElement.label = label;
    if (placeholderAttribute) newElement.placeholder = placeholderAttribute;
    if (titleAttribute) newElement.title = titleAttribute;

    elements.push(newElement);
  });

  return elements;
}

type AnalyzedElement = {
  cssSelector: string;
  elementType: string;
  content?: string;
};

function analyzePageElements(node: HTMLElement): AnalyzedElement[] {
  const elements: AnalyzedElement[] = [];

  // 1. Get the page title
  const title = node.querySelector('title');
  if (title) {
    elements.push({
      cssSelector: 'title',
      elementType: 'title',
      content: title.textContent,
    });
  }

  // 2. Get all headers
  const headers = node.querySelectorAll('h1, h2, h3, h4, h5, h6');
  // Also get the text for elements with a header role or a class name or id that contains "header" or "heading" or "title".
  const headerRoles = node.querySelectorAll('[role="heading"], [role="header"]');
  const headerClassNames = node.querySelectorAll('[class*="header"], [class*="heading"], [class*="title"]');
  const headerIds = node.querySelectorAll('[id*="header"], [id*="heading"], [id*="title"]');
  const headerElements = [...headers, ...headerRoles, ...headerClassNames, ...headerIds];
  headerElements.forEach((header) => {
    if (header.textContent.length > 3 && header.textContent.length < 300) {
      elements.push({
        cssSelector: getCssSelector(header),
        elementType: 'header',
        content: header.textContent,
      });
    }
  });

  // // 3. Get large blocks of text (e.g., paragraphs with more than 50 words)
  // const paragraphs = node.querySelectorAll('p');
  // paragraphs.forEach((paragraph) => {
  //   if ((paragraph.textContent?.split(' ').length || 0) > 50) {
  //     elements.push({
  //       node: getCssSelector(paragraph),
  //       elementType: 'large-text-block',
  //       content: paragraph.textContent || '',
  //     });
  //   }
  // });

  // 4. Get all form elements
  const formElements = getFormElements(node);
  elements.push(...formElements);

  return elements;
}

export type ContentRequestBody = {
  action: 'getSelection' | 'getText' | 'getDOM' | 'fill';
  params: {
    cssSelector?: string;
    text?: string;
  }
}

export type ContentResponseBody = {
  result?: string;
  error?: string;
}

chrome.runtime.onMessage.addListener(async function (message, tab, res) {
  console.log("here!", message, tab, res);

  if (message.name === "pageRequestHandler") {
    let body: ContentRequestBody = message.body;

    function logAndSend(response: ContentResponseBody) {
      console.log(response);
      res(response);
    }

    if (body.action === 'getSelection') {
      const selection = window.getSelection();
      if (selection) {
        logAndSend({ result: selection.toString() });
      } else {
        logAndSend({ error: "Selection not found" });
      }
    } else if (body.action === 'getText') {
      const element = document.querySelector(body.params.cssSelector) as HTMLElement;
      if (element) {
        logAndSend({ result: element.innerText });
      } else {
        logAndSend({ error: "Element not found" });
      }
    } else if (body.action === 'getDOM') {
      const element = document.querySelector(body.params.cssSelector) as HTMLElement;
      if (element) {
        let elements = analyzePageElements(element);
        console.log(elements);
        logAndSend({ result: JSON.stringify(elements) });
      } else {
        logAndSend({ error: "Element not found" });
      }
    } else if (body.action === 'fill') {
      if (fill(body.params.cssSelector, body.params.text)) {
        logAndSend({ result: 'success' });
      } else {
        logAndSend({ error: "Element not found" });
      }
    } else {
      logAndSend({ error: "Unknown action" });
    }
  }
});

const handler: PlasmoMessaging.MessageHandler<ContentRequestBody, ContentResponseBody> = async (req, res) => {
  console.log("here!", req, res);
}

// For Plasmo for some reason.
export {};
