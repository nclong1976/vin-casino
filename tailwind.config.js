/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			'button-bg': '#5b4a3a',
  			'button-text': '#a39c96',
  			'input-border': '#e5e7eb',
  			'input-text': '#9ca3af',
  			'overlay': 'rgba(18, 17, 16, 0.95)',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  		
  		
  		'figma-text-3': 'hsl(var(--figma-text-3))',
  		
  		'figma-text-2': 'hsl(var(--figma-text-2))',
  		
  		'figma-text-1': 'hsl(var(--figma-text-1))',
  		
  		'figma-text-6': 'hsl(var(--figma-text-6))',
  		
  		'figma-text-8': 'hsl(var(--figma-text-8))',
  		
  		'figma-text-5': 'hsl(var(--figma-text-5))',
  		
  		'figma-text-10': 'hsl(var(--figma-text-10))',
  		
  		'figma-text-7': 'hsl(var(--figma-text-7))',
  		
  		'figma-text-9': 'hsl(var(--figma-text-9))',
  		
  		'figma-text-4': 'hsl(var(--figma-text-4))',
  		
  		
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		
  		
  		fontSize: {
  			
  			'figma-8': '8px',
  			
  			'figma-9': '9px',
  			
  			'figma-10': '10px',
  			
  			'figma-11': '11px',
  			
  		},
  		
  		
  		fontWeight: {
  			
  			'figma-normal': '400',
  			
  		},
  		
  		
  		lineHeight: {
  			
  			'figma-10': '10px',
  			
  			'figma-11': '11px',
  			
  			'figma-12': '12px',
  			
  			'figma-13': '13px',
  			
  			'figma-14': '14px',
  			
  			'figma-15': '15px',
  			
  			'figma-17': '17px',
  			
  		},
  		
  		
  		fontFamily: {
  			
  			'heading': ['"Inter"', 'sans-serif'],
  			
  		},
  		
  		
  	}
  },
  plugins: [require("tailwindcss-animate")],
};