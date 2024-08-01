import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { v1 as uuidv1 } from 'uuid';
import { UnirseSalaXcodigo, UsuarioResponse } from '../interfaces/req-response';
import { HomeService } from '../services/home.service';
import { BodyMainComponent } from './components/body-main/body-main.component';
import { HeaderPrincipalComponent } from './components/header-principal/header-principal.component';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterModule,
    CommonModule,
    HeaderPrincipalComponent,
    BodyMainComponent,
    ReactiveFormsModule,
    FormsModule
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export default class HomeComponent implements OnInit {
  public router = inject(Router);
  public serviceHome = inject(HomeService);
  public formBuilder = inject(FormBuilder);

  // Entrar mediante codigo de sala
  public codigoSala = "";

  // Es para saber si esta Login o Resgistrado
  // true : Login
  // false: Registro
  public viewOptionsUser = signal(false);

  // Es para tomar encuenta si la persona ya en un pasado entro a la pagina
  // true : indica que la persona tiene la cuenta iniciada
  // false : indica que la persona ni registrado esta o cerro sesion
  // public isLogged = signal(false);

  public titulo: string = "";
  //
  public viewActions = signal(false);

  // MENSAJA DE ALERTA
  public viewMessageAlert = signal(false);
  public messageAlert = signal("");

  // FORMULARIOS
  // Formulario de CODIGO DE SALA
  public codigoSalaForm: FormGroup = this.formBuilder.group({
    codigoSala: ['', [Validators.required]],
  });

  // Formulario de INICIO SESION
  public myFormLogin: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });
  // Formulario de REGISTRO
  public myFormRegister: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
    confirmPassword: ['', [Validators.required]],
  });
  constructor() {
    if (this.viewOptionsUser()) {
      this.titulo = "Inicio de Sesion";
    } else {
      this.titulo = "Registrese";
    }
  }
  ngOnInit(): void {
    const isValueLocalStorage = localStorage.getItem('isAuthenticaded');
    if (isValueLocalStorage) {
      if (isValueLocalStorage === 'true') {
        this.serviceHome.onChangeIsAuthenticaded(true);
        //this.serviceHome.updateUsuarioAuth();
      } else {
        this.serviceHome.onChangeIsAuthenticaded(false);
      }
    } else {
      localStorage.setItem('isAuthenticaded', this.serviceHome.getIsAuthenticaded().toString());
    }
  }

  viewMessage(): boolean {
    return this.viewMessageAlert() && !this.serviceHome.getIsAuthenticaded();
  }

  changeViewMessage(valueNew: boolean): void {
    this.viewMessageAlert.set(valueNew);
  }

  validInitSession(): void {
    this.changeViewMessage(true);
    this.messageAlert.set("Inicie Sesion Por Favor");
  }

  changeViewOptionsUser(): void {
    this.viewOptionsUser.set(!this.viewOptionsUser());
    if (this.viewOptionsUser()) {
      this.titulo = "Inicio de Sesion";
    } else {
      this.titulo = "Registrese";
    }
    // console.log(this.viewOptionsUser());
  }

  // METODOS DE LOGIN, REGISTRO Y CERRAR SESION

  onSaveFormLogin(): void {
    const { email, password } = this.myFormLogin.value;
    if (this.myFormLogin.valid) {
      this.serviceHome.loginUsuario(email, password)
        .subscribe((res: UsuarioResponse) => {
          //console.log(res.usuario);
          this.serviceHome.updateUsuarioAuth(res.usuario.email, res.usuario.password);
          this.serviceHome.onChangeIsAuthenticaded(true);

          localStorage.setItem('isAuthenticaded', this.serviceHome.getIsAuthenticaded().toString());
          localStorage.setItem('usuario', JSON.stringify(res.usuario));
          this.serviceHome.onChangeviewActions();
          this.myFormLogin.reset();
          // this.router.navigate(['/diagrama']);
          // let usuario: UsuarioResponse;
          // const usuarioData = JSON.parse(localStorage.getItem('usuario'));
          // usuario = Object.assign(new UsuarioResponse(), usuarioData);
        }, (dataError) => {
          this.changeViewMessage(true);
          this.messageAlert.set(dataError.error.mensaje);
          this.myFormRegister.reset();
        })
    } else {
      this.changeViewMessage(true);
      this.messageAlert.set("Campos Invalidos o Vacios");
    }
  }

  onSaveFormRegister(): void {
    const { email, password, confirmPassword } = this.myFormRegister.value;
    if (this.myFormRegister.valid) {
      if (!(password == confirmPassword)) {
        this.changeViewMessage(true);
        this.messageAlert.set("Verificar igualdad contraseñas");
      } else {
        this.serviceHome.registroUsuario(email, password).subscribe((res) => {
          // console.log(res);
          if (res.ok) {
            this.serviceHome.onChangeIsAuthenticaded(true);
            this.serviceHome.updateUsuarioAuth(res.usuario.email, res.usuario.password);
            localStorage.setItem('isAuthenticaded', this.serviceHome.getIsAuthenticaded().toString());
            localStorage.setItem('usuario', JSON.stringify(res.usuario));
            this.serviceHome.onChangeviewActions();
            this.myFormRegister.reset();
          } else {
            console.log(res.ok);
            this.changeViewMessage(true);
            this.messageAlert.set("Ya existe un usuario con ese correo");
            this.myFormRegister.reset();
          }
        }, (dataError) => {
          this.changeViewMessage(true);
          this.messageAlert.set(dataError.error.mensaje);
          this.myFormRegister.reset();
        });
      }
    } else {
      this.changeViewMessage(true);
      this.messageAlert.set("Campos Invalidos o Vacios");
    }
  }

  cerrarSesion(): void {
    this.serviceHome.onChangeIsAuthenticaded(false);
    localStorage.setItem('isAuthenticaded', this.serviceHome.getIsAuthenticaded().toString());
    localStorage.removeItem('usuario');
    this.serviceHome.onChangeviewActions();
  }

  nuevaReunion() {
    const usuarioAuth = this.serviceHome.usuarioAuth();
    //console.log(usuarioAuth);
    this.validInitSession();
    const idSala = uuidv1().replace(/-/g, '').substr(0, 10);
    this.serviceHome.crearSala(usuarioAuth.email, idSala).subscribe((res) => {
      this.router.navigate(['/diagrama', idSala]);
    }, (dataError) => {
      console.log(dataError);
      this.changeViewMessage(true);
      this.messageAlert.set(dataError.error.mensaje);
    });
    // console.log(idSala);
  }

  verificarCodigo() {
    const usuarioAuth = this.serviceHome.usuarioAuth();

    let { codigoSala } = this.codigoSalaForm.value;
    if (this.codigoSalaForm.valid) {
      codigoSala = codigoSala.replace(/\s/g, '');
      if (codigoSala.length == 10) {
        this.serviceHome.unirmesalaXcodigo(codigoSala).subscribe((res: UnirseSalaXcodigo) => {
          if (res.ok) {
            this.serviceHome.asistenciaEntrar(usuarioAuth.email, codigoSala).subscribe((res) => {
              console.log(res);
            });
            this.router.navigate(['/diagrama', codigoSala]);
          } else {
            console.log(res.ok);
          }
        }, (dataError) => {
          console.log(dataError.error.mensaje);
        });
      } else {
        this.codigoSalaForm.reset();
      }
    } else {
      this.codigoSalaForm.reset();
    }
  }
}
