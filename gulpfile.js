const gulp = require('gulp');
const del = require('del');
const uglify = require('gulp-uglify');
const cleanCSS = require('gulp-clean-css');
const htmlmin = require('gulp-htmlmin');
const imagemin = require('gulp-imagemin');
const rename = require('gulp-rename');

// Clean dist folder
gulp.task('clean', () => del(['dist/**', '!dist']));

// Minify JS
gulp.task('scripts', () =>
  gulp.src(['src/**/*.js', '!src/**/*.min.js'])
    .pipe(uglify())
    .pipe(rename({ suffix: '.min' }))
    .pipe(gulp.dest('dist'))
);

// Minify CSS
gulp.task('styles', () =>
  gulp.src(['src/**/*.css', '!src/**/*.min.css'])
    .pipe(cleanCSS())
    .pipe(rename({ suffix: '.min' }))
    .pipe(gulp.dest('dist'))
);

// Minify HTML
gulp.task('html', () =>
  gulp.src('src/**/*.html')
    .pipe(htmlmin({ collapseWhitespace: true }))
    .pipe(gulp.dest('dist'))
);

// Optimize images
gulp.task('images', () =>
  gulp.src('src/images/**/*')
    .pipe(imagemin())
    .pipe(gulp.dest('dist/images'))
);

// Copy other assets (e.g., fonts, JSON)
gulp.task('assets', () =>
  gulp.src(['src/**/*', '!src/**/*.js', '!src/**/*.css', '!src/**/*.html', '!src/images/**'])
    .pipe(gulp.dest('dist'))
);

// Default task
gulp.task('default', gulp.series(
  'clean',
  gulp.parallel('scripts', 'styles', 'html', 'images', 'assets')
));