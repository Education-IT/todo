/*!
* Start Bootstrap - Simple Sidebar v6.0.5 (https://startbootstrap.com/template/simple-sidebar)
* Copyright 2013-2022 Start Bootstrap
* Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-simple-sidebar/blob/master/LICENSE)
*/
// 
// Scripts
// 


window.addEventListener('DOMContentLoaded', event => {

    // Toggle the side navigation
    const sidebarToggle = document.body.querySelector('#sidebarToggle');
    if (sidebarToggle) {
         //Uncomment Below to persist sidebar toggle between refreshes
         if (localStorage.getItem('sb|sidebar-toggle') === 'true') {
             document.body.classList.toggle('sb-sidenav-toggled');
         }
        sidebarToggle.addEventListener('click', event => {
            event.preventDefault();
            document.body.classList.toggle('sb-sidenav-toggled');
            localStorage.setItem('sb|sidebar-toggle', document.body.classList.contains('sb-sidenav-toggled'));
        });
    }



});

function ChangeContent(name) {
    if(name === 'MyPlan'){
        var password = prompt("Enter password: ","");
        if(password !== "Nie Bądź taki cwany gościu jeden >:) ale jak już musisz wiedzieć co tu jest to zapraszam <3 Zasłużyłeś." || password !== "$"){
            return;
        }
    }
    var Category = document.getElementById("main-page");
    var Content = document.getElementById(name);
    
    Category.classList.remove('w3-animate-opacity'); 
    Category.offsetWidth;
    Category.innerHTML = Content.innerHTML;
    Category.classList.add('w3-animate-opacity'); 
    
}




