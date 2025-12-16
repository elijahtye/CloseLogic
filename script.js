// Reviews Carousel with Shuffle
document.addEventListener('DOMContentLoaded', function() {
    const reviewCards = Array.from(document.querySelectorAll('.review-card'));
    const dots = document.querySelectorAll('.dot');
    let reviewInterval;
    let shuffledReviews = [];
    let currentIndex = 0;

    // Shuffle array function (Fisher-Yates algorithm)
    function shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Initialize shuffled reviews
    shuffledReviews = shuffleArray(reviewCards);
    
    // Function to show a specific review
    function showReview(reviewCard) {
        // Remove active class from all reviews
        reviewCards.forEach(card => card.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));

        // Add active class to current review
        reviewCard.classList.add('active');
        
        // Find the original index for the dot
        const originalIndex = reviewCards.indexOf(reviewCard);
        if (originalIndex >= 0 && dots[originalIndex]) {
            dots[originalIndex].classList.add('active');
        }
    }

    // Function to show next review from shuffled deck
    function nextReview() {
        if (shuffledReviews.length === 0) {
            // Reshuffle when we've gone through all reviews
            shuffledReviews = shuffleArray(reviewCards);
            currentIndex = 0;
        }
        
        showReview(shuffledReviews[currentIndex]);
        currentIndex = (currentIndex + 1) % shuffledReviews.length;
        
        // If we've shown all reviews, reshuffle
        if (currentIndex === 0) {
            shuffledReviews = shuffleArray(reviewCards);
        }
    }

    // Auto-rotate reviews every 5 seconds
    function startAutoRotate() {
        reviewInterval = setInterval(nextReview, 5000);
    }

    // Stop auto-rotate when user interacts
    function stopAutoRotate() {
        clearInterval(reviewInterval);
    }

    // Add click event listeners to dots
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            stopAutoRotate();
            showReview(reviewCards[index]);
            // Reshuffle and restart auto-rotate after 10 seconds
            setTimeout(() => {
                shuffledReviews = shuffleArray(reviewCards);
                currentIndex = 0;
                startAutoRotate();
            }, 10000);
        });
    });

    // Pause on hover
    const reviewsContainer = document.querySelector('.reviews-container');
    if (reviewsContainer) {
        reviewsContainer.addEventListener('mouseenter', stopAutoRotate);
        reviewsContainer.addEventListener('mouseleave', startAutoRotate);
    }

    // Show first review and start auto-rotation
    if (shuffledReviews.length > 0) {
        showReview(shuffledReviews[0]);
        currentIndex = 1;
    }
    startAutoRotate();

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '#login' && href !== '#blog') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Add animation on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards and scoring items
    document.querySelectorAll('.feature-card, .scoring-item, .plan-card, .trend-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Draw Charts
    function drawCharts() {
        // Intent Distribution Chart (Doughnut/Pie)
        const intentCanvas = document.getElementById('intentChart');
        if (intentCanvas) {
            const ctx = intentCanvas.getContext('2d');
            const centerX = intentCanvas.width / 2;
            const centerY = intentCanvas.height / 2;
            const radius = 70;
            
            // High intent (68%)
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2 * 0.68);
            ctx.lineTo(centerX, centerY);
            ctx.fillStyle = '#D4AF37';
            ctx.fill();
            
            // Medium intent (20%)
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI * 2 * 0.68, Math.PI * 2 * 0.88);
            ctx.lineTo(centerX, centerY);
            ctx.fillStyle = '#FFA500';
            ctx.fill();
            
            // Low intent (12%)
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, Math.PI * 2 * 0.88, Math.PI * 2);
            ctx.lineTo(centerX, centerY);
            ctx.fillStyle = '#E0E0E0';
            ctx.fill();
            
            // Inner circle for doughnut effect
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
        }

        // Conversion Trend Chart (Line/Bar)
        const conversionCanvas = document.getElementById('conversionChart');
        if (conversionCanvas) {
            const ctx = conversionCanvas.getContext('2d');
            const width = conversionCanvas.width;
            const height = conversionCanvas.height;
            const padding = 20;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            
            // Draw grid lines
            ctx.strokeStyle = '#F0F0F0';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding + (chartHeight / 4) * i;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
            }
            
            // Draw trend line
            const dataPoints = [35, 42, 38, 48, 52, 58];
            const maxValue = Math.max(...dataPoints);
            const pointSpacing = chartWidth / (dataPoints.length - 1);
            
            ctx.strokeStyle = '#D4AF37';
            ctx.lineWidth = 3;
            ctx.beginPath();
            dataPoints.forEach((value, index) => {
                const x = padding + pointSpacing * index;
                const y = height - padding - (value / maxValue) * chartHeight;
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            
            // Draw points
            ctx.fillStyle = '#D4AF37';
            dataPoints.forEach((value, index) => {
                const x = padding + pointSpacing * index;
                const y = height - padding - (value / maxValue) * chartHeight;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Response Time Chart (Bar)
        const responseCanvas = document.getElementById('responseChart');
        if (responseCanvas) {
            const ctx = responseCanvas.getContext('2d');
            const width = responseCanvas.width;
            const height = responseCanvas.height;
            const padding = 20;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            
            // Draw bars
            const bars = [
                { label: 'CloseLogic', value: 2.1, color: '#D4AF37' },
                { label: 'Industry Avg', value: 8.5, color: '#E0E0E0' }
            ];
            const maxValue = Math.max(...bars.map(b => b.value));
            const barWidth = chartWidth / bars.length - 20;
            
            bars.forEach((bar, index) => {
                const barHeight = (bar.value / maxValue) * chartHeight;
                const x = padding + (chartWidth / bars.length) * index + 10;
                const y = height - padding - barHeight;
                
                ctx.fillStyle = bar.color;
                ctx.fillRect(x, y, barWidth, barHeight);
                
                // Add value label
                ctx.fillStyle = '#333333';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(bar.value + 'h', x + barWidth / 2, y - 5);
            });
        }
    }

    // Draw charts when page loads
    setTimeout(drawCharts, 100);
});

