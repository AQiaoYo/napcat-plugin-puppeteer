/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#FB7299',
                brand: {
                    pink: '#FB7299',
                    blue: '#00A1D6',
                    dark: '#18191C',
                    gray: '#F4F4F4',
                }
            }
        },
    },
    plugins: [],
}
