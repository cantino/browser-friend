# Browser Friend

GPT4 embedded in your browser, with the ability to use tools.

Current tools:

```
type RequestDOM = { cssSelector: string }; // Receive a summarized DOM for a selector.
type RequestText = { cssSelector: string }; // Request the visible text inside of a page region
type GetSelection = "GetSelection"; // Request the user's currently highlighted text
type Fill = { cssSelector: string, text: string } // To fill in form fields
type Calculate = { jsFormula: string } // To eval arbitrary JS in a sandbox, and return the result to the assistant.
type Respond = { textToDisplay: string } // To display a response to the user
```

Examples:

This example includes DOM viewing and form filling:
![hn-post](https://user-images.githubusercontent.com/83835/229370860-dbac54ea-4d9e-40ee-ba89-bd7593b92af9.gif)

This example includes DOM viewing, text fetching, and doing a calculation in a sandbox:
![hn-math](https://user-images.githubusercontent.com/83835/229370856-f05334fe-e03d-4c34-b099-c70e5ae94313.gif)

More advanced calculation (sometimes it writes a recursive version if you don't encourage it not to):
![fib](https://user-images.githubusercontent.com/83835/229373363-b0bcfec9-6729-455a-ba0d-cd8ef17c66a6.gif)


# Development

This extension is based on [Plasmo](https://docs.plasmo.com/) and was bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
