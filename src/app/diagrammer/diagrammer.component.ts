import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as joint from '@joint/plus';
import { highlighters } from '@joint/plus';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import { Subscription } from 'rxjs';
import { Cell, ColaboradoresResponse, DataPaper, GraphToCodigo } from '../interfaces/req-response';
import { DiagrammerService } from '../services/diagrammer.service';
import { HomeService } from '../services/home.service';
import './helpers/shapes';

@Component({
  selector: 'app-diagrammer',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './diagrammer.component.html',
  styleUrl: './diagrammer.component.css',
})
export default class DiagrammerComponent implements OnInit, OnDestroy {

  public clipboard = inject(Clipboard);
  public serviceDiagrammer = inject(DiagrammerService);
  public router = inject(Router);
  public bandera = signal<boolean>(true);
  mensajePruebaSubscription: Subscription;
  colaboradoresSubscription: Subscription;
  dataSalaSubscription: Subscription;
  public textoGraphToCodigo = signal<string>("Convierte el Diagrama en Codigo \n Presiona 'Developer' seleccona \n el lenguaje");
  public colaboradoresSala = signal<ColaboradoresResponse>(
    {
      asistentes: [],
      sala: "",
      ok: false
    }
  );
  public infoRouter = inject(ActivatedRoute)
  public banderaShare = signal<boolean>(true);
  public serviceHome = inject(HomeService);

  @ViewChild('canvas') canvas: ElementRef;
  @ViewChild('canvasStencil') canvasStencil: ElementRef;

  public graph: joint.dia.Graph;
  public paper: joint.dia.Paper;

  public graphStencil: joint.dia.Graph;
  public paperStencil: joint.dia.Paper;
  paperHeight: number;
  paperWidth: number;
  //
  public datosPage;
  constructor() {
    this.datosPage = this.infoPage();
    this.entrarSalaTrabajo();
  }

  public ngOnInit(): void {
    setTimeout(() => {
      this.banderaShare.set(false);
    }, 10000);
    //this.serviceHome.updateUsuarioAuth();
    this.initilizePizarra(this);
    this.initilizeStencil(this);

    // VERIFICAR SI HAY DATA EXISTENTE EN LA SALA
    const dataAntiguaSala = this.serviceDiagrammer.getDatSala(this.datosPage.params).subscribe((infoData: any) => {
      if (!(infoData.data == "NO TIENE INFORMACION")) {
        const data: any = infoData.data;
        this.bandera.set(false);
        this.graph.fromJSON(JSON.parse(data));
        this.graph.clear();
        this.graph.addCells(JSON.parse(data).cells);
        this.paper.unfreeze();
        this.bandera.set(true);
      }
    });

    // ESCUCHAR DATA DE SALA DE TRABAJO ENVIADA POR EL SERVIDOR
    this.dataSalaSubscription = this.serviceDiagrammer.escucharDataSalaTrabajo().subscribe((data: any) => {
      this.bandera.set(false);
      this.graph.fromJSON(JSON.parse(data));
      this.graph.clear();
      this.graph.addCells(JSON.parse(data).cells);
      this.paper.unfreeze();
      this.bandera.set(true);
    });

    this.colaboradoresSubscription = this.serviceDiagrammer.colaboradoresSalaTrabajo().subscribe((data: ColaboradoresResponse) => {
      console.log(data);
      this.colaboradoresSala.set(data);
    });
  }

  ngOnDestroy(): void {
    this.serviceDiagrammer.asistenciaBorrar(this.serviceHome.usuarioAuth().email, this.datosPage.params).subscribe((data: any) => {
      console.log(data);
      this.serviceDiagrammer.salirSalaTrabajo(this.datosPage.params, this.serviceHome.usuarioAuth().email);
    });
    this.serviceDiagrammer.salaVacia(this.datosPage.params).subscribe((data: any) => {
      console.log(data);
    });

    this.salirSalatrabajo();
    this.dataSalaSubscription.unsubscribe();
    this.colaboradoresSubscription.unsubscribe();
  }

  public infoPage(): any {
    let routeParams: any;
    this.infoRouter.params.subscribe(params => {
      routeParams = params
    });
    const fullUrl = window.location.origin + this.router.url;
    return {
      url: fullUrl,
      params: routeParams.sala
    }
  }

  public initilizePizarra(instance: DiagrammerComponent) {
    const elementPaper = document.getElementById('canvasPrimary');
    const paperHeight = elementPaper!.clientHeight;
    const paperWidth = elementPaper!.clientWidth;
    this.paperHeight = paperHeight;
    this.paperWidth = paperWidth;
    const topY = 20;
    const graph = (this.graph = new joint.dia.Graph(
      {},
      { cellNamespace: joint.shapes }
    ));

    // OPERACIONES INTERACTIVAS DEL PAPER

    const restrictTranslate = (elementView: any) => {
      const element = elementView.model;
      const padding = element.isEmbedded() ? 20 : 10;
      return {
        x: padding,
        y: element.getBBox().y,
        width: paperWidth - 2 * padding,
        height: 0,
      };
    };

    const interactive = function (cellView: any) {
      const cell = cellView.model;
      return cell.isLink() ? { linkMove: false, labelMove: false } : true;
    };

    const defaultLink = (sourceView: any) => {
      const type = sourceView.model.get('type');
      switch (type) {
        case 'app.Message': {
          return new joint.shapes.app.LifeSpan();
        }
        case 'app.Lifeline': {
          return new joint.shapes.app.Message();
        }
      }
      throw new Error('Unknown link type.');
    };

    const connectionStrategy = (
      endDefinition: joint.dia.Link.EndJSON,
      endView: joint.dia.CellView,
      endMagnet: SVGElement,
      coords: joint.dia.Point,
      link: joint.dia.Link,
      endType: joint.dia.LinkEnd
    ) => {
      const type = link.get('type');
      switch (type) {
        case 'app.LifeSpan':
          if (endType === 'source') {
            endDefinition.anchor = {
              name: 'connectionRatio',
              args: { ratio: 1 },
            };
          } else {
            endDefinition.anchor = {
              name: 'connectionRatio',
              args: { ratio: 0 },
            };
          }
          return endDefinition;
        case 'app.Message':
          if (endType === 'source') {
            return joint.connectionStrategies.pinAbsolute.call(
              paper,
              endDefinition,
              endView,
              endMagnet,
              coords,
              link,
              endType
            );
          } else {
            endDefinition.anchor = { name: 'connectionPerpendicular' };
            return endDefinition;
          }
        default:
          throw new Error('Unknown link type.');
      }
    };

    const validateConnection = (
      cellViewS: any,
      magnetS: any,
      cellViewT: any,
      magnetT: any,
      end: any,
      linkView: any
    ) => {
      if (cellViewS === cellViewT) {
        return false;
      }
      const type = linkView.model.get('type');
      const targetType = cellViewT.model.get('type');
      switch (type) {
        case 'app.Message': {
          return targetType === 'app.Lifeline';
        }
        case 'app.LifeSpan': {
          if (targetType !== 'app.Message') {
            return false;
          }
          if (
            cellViewT.model instanceof joint.dia.Link &&
            cellViewS.model instanceof joint.dia.Link
          ) {
            if (cellViewT.model.source().id !== cellViewS.model.target().id)
              return false;
          }
          return true;
        }
        default: {
          return false;
        }
      }
    };

    // FUNCIONES CON RESPECTO A LOS EVENTOS QUE SE PUEDEN REALIZAR EN EL PAPER GRAPH
    const onEventAdd = (link: any) => {
      if (!link.isLink()) {
        return;
      }
      const type = link.get('type');
      switch (type) {
        case 'app.Lifeline': {
          const tools = new joint.dia.ToolsView({
            layer: null,
            tools: [
              new joint.linkTools.HoverConnect({
                scale: toolsScale,
              }),
            ],
          });
          link.findView(paper).addTools(tools);
          break;
        }
      }
    };

    const onEventLinkPointerMove = (
      linkView: any,
      _evt: any,
      _x: any,
      y: any
    ) => {
      const type = linkView.model.get('type');
      switch (type) {
        case 'app.Message': {
          const sView = linkView.sourceView;
          const tView = linkView.targetView;
          if (!sView || !tView) return;
          const padding = 20;
          const minY =
            Math.max(tView.sourcePoint.y - sView.sourcePoint.y, 0) + padding;
          const maxY = sView.targetPoint.y - sView.sourcePoint.y - padding;
          linkView.model.setStart(
            Math.min(Math.max(y - sView.sourcePoint.y, minY), maxY)
          );
          break;
        }
        case 'app.LifeSpan': {
          break;
        }
      }
    };

    const onEventLinkConnect = (linkView: any) => {
      const type = linkView.model.get('type');
      console.log(type);
      switch (type) {
        case 'app.Message': {
          this.editText(linkView, 'labels/0/attrs/labelText/text', this);
          break;
        }
        case 'app.LifeSpan': {
          break;
        }
      }
    };

    const onEventCellMouseEnter = (cellView: any) => {
      const cell = cellView.model;
      const type = cell.get('type');
      switch (type) {
        case 'app.Message': {
          const tools = new joint.dia.ToolsView({
            tools: [
              new joint.linkTools.Connect({
                scale: toolsScale,
                distance: -20,
              }),
              new joint.linkTools.Remove({
                scale: toolsScale,
                distance: 15,
              }),
            ],
          });
          cellView.addTools(tools);
          break;
        }
        case 'app.LifeSpan': {
          const tools = new joint.dia.ToolsView({
            tools: [
              new joint.linkTools.Remove({
                scale: toolsScale,
                distance: 15,
              }),
            ],
          });
          cellView.addTools(tools);
          break;
        }
        case 'app.Role': {
          const tools = new joint.dia.ToolsView({
            tools: [
              new joint.elementTools.Remove({
                scale: toolsScale,
                distance: '50%',
              }),
            ],
          });
          cellView.addTools(tools);
          break;
        }
      }
    };

    const onEventCellMouseLeave = (cellView: any) => {
      const cell = cellView.model;
      const type = cell.get('type');
      switch (type) {
        case 'app.Role':
        case 'app.LifeSpan':
        case 'app.Message': {
          cellView.removeTools();
          break;
        }
      }
    };

    const onEventBlackPointerdblclick = (evt: any, x: any, y: any) => {
      const role = new joint.shapes.app.Role({
        position: { x: x - 50, y: topY },
      });
      role.addTo(graph);
      const lifeline = new joint.shapes.app.Lifeline();
      lifeline.attachToRole(role, paperHeight);
      lifeline.addTo(graph);
      this.editText(role.findView(paper), 'attrs/label/text', this);
    };

    const onEventLinkPointerdblclick = (linkView: any, evt: any) => {
      const labelIndex = linkView.findAttribute('label-idx', evt.target);
      if (!labelIndex) return;
      this.editText(linkView, `labels/${labelIndex}/attrs/labelText/text`, this);
    };

    const onEventElementPointerdblclick = (elementView: any, evt: any) => {
      switch (elementView.model.get('type')) {
        case 'app.Role': {
          this.editText(elementView, 'attrs/label/text', this);
          break;
        }
        case 'app.RoleGroup': {
          this.editText(elementView, 'attrs/label/text', this);
          break;
        }
      }
    };

    const onEventRemove = (element: any) => {
      if (this.bandera()) {
        if (!element.isElement()) {
          this.enviarDataSalaTrabajo();
          return;
        }
        const embeds = backend.getEmbeddedCells();
        if (embeds.length < 2) {
          backend.unembed(embeds);
          backend.remove();
          this.enviarDataSalaTrabajo();
        }
      }

    };

    const paper: any = (this.paper = new joint.dia.Paper({
      model: graph,
      height: elementPaper!.clientHeight,
      width: elementPaper!.clientWidth,
      background: {
        color: '#F8F9FA',
      },
      gridSize: 20,
      frozen: true,
      async: true,
      drawGrid: true,
      drawGridSize: 20,
      cellViewNamespace: joint.shapes,
      defaultConnectionPoint: { name: 'rectangle' },
      moveThreshold: 5,
      linkPinning: false,
      markAvailable: true,
      preventDefaultBlankAction: false,
      connector: { name: 'rounded' },
      restrictTranslate,
      interactive,
      defaultLink,
      connectionStrategy,
      validateConnection,
      highlighting: {
        connecting: {
          name: 'addClass',
          options: {
            className: 'highlighted-connecting',
          },
        },
      },
    }));

    const toolsScale = 2;
    graph.on('add', onEventAdd);
    graph.on('remove', onEventRemove);
    paper.on('link:connect', onEventLinkConnect);
    paper.on('cell:mouseenter', onEventCellMouseEnter);
    paper.on('cell:mouseleave', onEventCellMouseLeave);
    paper.on('link:pointermove', onEventLinkPointerMove);
    paper.on('link:pointerdblclick', onEventLinkPointerdblclick);
    paper.on('blank:pointerdblclick', onEventBlackPointerdblclick);

    // este necesito para hacer mis pruebas
    paper.on('element:pointerdblclick', onEventElementPointerdblclick);
    paper.on('element:pointerclick', (elementView: any, evt: any) => {
      const a = elementView.model.get('type');
      this.enviarDataSalaTrabajo();
    });
    paper.on('link:pointerup', () => {
      this.enviarDataSalaTrabajo();
    });

    paper.on('element:pointerup', () => {
      this.enviarDataSalaTrabajo();
    });

    paper.on('element:delete', () => {
      console.log("hola");
    });

    const backend = new joint.shapes.app.RoleGroup();
    backend.listenTo(graph, 'change:position', function (cell) {
      if (cell.isEmbeddedIn(backend)) backend.fitRoles();
    });

    // const role2 = new joint.shapes.app.Role({ position: { x: 500, y: topY } });
    // role2.setName('Web Server');
    // role2.addTo(graph);

    // const role3 = new joint.shapes.app.Role({ position: { x: 900, y: topY } });
    // role3.setName('Database Server');
    // role3.addTo(graph);

    // const role1 = new joint.shapes.app.Role({ position: { x: 100, y: topY } });
    // role1.setName('Browser');
    // role1.addTo(graph);
    // const lifeline1 = new joint.shapes.app.Lifeline();
    // lifeline1.attachToRole(role1, paperHeight);
    // lifeline1.addTo(graph);

    // const lifeline2 = new joint.shapes.app.Lifeline();
    // lifeline2.attachToRole(role2, paperHeight);
    // lifeline2.addTo(graph);

    // const lifeline3 = new joint.shapes.app.Lifeline();
    // lifeline3.attachToRole(role3, paperHeight);
    // lifeline3.addTo(graph);

    // const message1 = new joint.shapes.app.Message();
    // message1.setFromTo(lifeline1, lifeline2);
    // message1.setStart(50);
    // message1.setDescription('HTTP GET Request');
    // message1.addTo(graph);

    // const message2 = new joint.shapes.app.Message();
    // message2.setFromTo(lifeline2, lifeline3);
    // message2.setStart(150);
    // message2.setDescription('SQL Command');
    // message2.addTo(graph);

    // const message3 = new joint.shapes.app.Message();
    // message3.setFromTo(lifeline3, lifeline2);
    // message3.setStart(250);
    // message3.setDescription('Result Set');
    // message3.addTo(graph);

    // const lifespan1 = new joint.shapes.app.LifeSpan();
    // lifespan1.attachToMessages(message2, message3);
    // lifespan1.addTo(graph);
    paper.unfreeze();


  }
  public initilizeStencil(instance: DiagrammerComponent) {
    const {
      paperHeight,
      paperWidth,
      graph,
      paper,
    } = instance;
    const topY = 20;
    const elementStencil = document.getElementById('stencilBase');
    const stencilHeight = elementStencil!.clientHeight;
    const stencilWidth = elementStencil!.clientWidth;
    const graphStencil = (this.graphStencil = new joint.dia.Graph(
      {},
      { cellNamespace: joint.shapes }
    ));
    const paperStencil: any = (this.paperStencil = new joint.dia.Paper({
      model: graphStencil,
      height: stencilHeight,
      width: stencilWidth,
      background: {
        color: '#F8F9FA',
      },
      interactive: false,
      gridSize: 20,
      drawGrid: true,
      drawGridSize: 20,
      cellViewNamespace: joint.shapes,
      defaultConnectionPoint: { name: 'rectangle' },
    }));

    const roleExample = new joint.shapes.app.Role({
      position: { x: stencilWidth / 2 - 120, y: stencilHeight / 2 - 60 },
    });
    roleExample.setName('Elemento');
    roleExample.addTo(graphStencil);
    paperStencil.on('element:pointerdblclick', () => {
      const elemento1 = new joint.shapes.app.Role({
        position: { x: 10, y: topY },
      });
      elemento1.setName('Ejemplo');
      elemento1.addTo(graph);
      const lifeline1 = new joint.shapes.app.Lifeline();
      lifeline1.attachToRole(elemento1, paperHeight);
      lifeline1.addTo(graph);
      this.paper.freeze();
      this.paper.unfreeze();
      this.enviarDataSalaTrabajo();
    });
  }


  public ngAfterViewInit(): void {
    const { paper, canvas, paperStencil, canvasStencil } = this;
    canvas.nativeElement.appendChild(paper.el);
    canvasStencil.nativeElement.appendChild(paperStencil.el);
    this.serviceDiagrammer.getColaboradores(this.datosPage.params).subscribe((data: ColaboradoresResponse) => {
      this.colaboradoresSala.set(data);
    });
  }

  public onChangeViewFile(): void {
    this.serviceDiagrammer.onChangeviewActionsFile(true);
    this.serviceDiagrammer.onChangeviewActionsDev(false);
  }

  public onChangeViewDev(): void {
    this.serviceDiagrammer.onChangeviewActionsDev(true);
    this.serviceDiagrammer.onChangeviewActionsFile(false);
  }

  public onChangeViewShare(value: boolean): void {
    this.banderaShare.set(value);
  }

  importarContent(event: any): void {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const extension = file.name.split('.').pop();

      if (extension !== 'json') {
        console.error('Tipo de archivo no permitido');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target!.result as string;
        this.bandera.set(false);
        this.graph.fromJSON(JSON.parse(data));
        this.graph.clear();
        this.graph.addCells(JSON.parse(data).cells);
        this.paper.unfreeze();
        this.bandera.set(true);
        this.enviarDataSalaTrabajo();
      };
      reader.readAsText(file);
    }
  }

  exportarContent(): void {
    const exportResult = JSON.stringify(this.graph.toJSON());
    const blob = new Blob([exportResult], { type: 'text/plain' });
    saveAs(blob, 'diagram.json');
  }

  editText(cellView: any, textPath: any, instance: DiagrammerComponent) {
    const cell = cellView.model;
    const textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';
    textarea.style.width = '400px';
    textarea.style.height = '400px';
    textarea.style.left = '50%';
    if (typeof this.paper.options.height === 'number') {
      textarea.style.top = `${this.paper.options.height / 2}px`;
    }
    textarea.style.transform = 'translate(-50%, -50%)';
    textarea.style.padding = '5px';
    textarea.style.resize = 'none';
    textarea.style.fontSize = '50px';
    textarea.style.fontWeight = 'bold';
    textarea.style.boxShadow = '10px 10px 5px rgba(0, 0, 0, 0.5)';
    textarea.placeholder = cell.placeholder || 'Enter text here...';
    textarea.value = cell.prop(textPath) || '';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);

    cellView.paper.el.style.filter = 'blur(0.5px) grayscale(1)';
    cellView.paper.el.style.pointerEvents = 'none';

    const highlighter = highlighters.mask.add(cellView, 'root', 'selection', {
      layer: joint.dia.Paper.Layers.FRONT,
      deep: true,
    });

    function close() {
      textarea.remove();
      cellView.paper.el.style.filter = '';
      cellView.paper.el.style.pointerEvents = '';
      highlighter.remove();
    }

    function saveText() {
      cell.prop(textPath, textarea.value);
      instance.enviarDataSalaTrabajo();
      //console.log("HOLA");
      close();
    }

    textarea.addEventListener('blur', (saveText));

    textarea.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        textarea.blur();
      }
      if (evt.key === 'Escape') {
        textarea.removeEventListener('blur', saveText);
        close();
      }
    });
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.datosPage.url);
  }

  enviarMensajeServidor() {
    this.serviceDiagrammer.enviarPruebaMensaje('Hola Mundo');
  }

  // FUNCION DE SOCKET PARA EMITIR UN EVENTO
  // DE ENTRAR A UNA SALA EN ESPECIFICO
  entrarSalaTrabajo() {
    this.serviceDiagrammer.entrarSalaTrabajo(this.datosPage.params, this.serviceHome.usuarioAuth().email);
  }

  salirSalatrabajo() {
    this.serviceDiagrammer.salirSalaTrabajo(this.datosPage.params, this.serviceHome.usuarioAuth().email);
  }

  // FUNCION DE SOCKET PARA EMITIR UN EVENTO
  // DE ENVIAR DATA DE LA SALA DE TRABAJO
  enviarDataSalaTrabajo() {
    // console.log("Enviando data de la sala de trabajo");
    this.serviceDiagrammer.enviarDataSalaTrabajo({
      cliente: this.serviceHome.usuarioAuth().email,
      nombre_sala: this.datosPage.params,
      informacion: JSON.stringify(this.graph.toJSON())
      //informacion: JSON.stringify(this.graph.getCells())
    });
  }

  public obtenerDataConvert(): string {
    let dataEnviarServidor: string = "";
    let dataNodoDS: string = "";
    const dataPaper = this.graph.toJSON();
    const dataMapeada: DataPaper = (dataPaper);
    dataMapeada.cells.forEach((cell: Cell) => {
      if (cell.type === 'app.Role') {
        let etiqueta: string = cell.attrs.label!.text;
        etiqueta = etiqueta.replace(/\n/g, '');
        dataNodoDS += etiqueta + "\n";
      }
    });
    dataMapeada.cells.forEach((cell: Cell) => {
      if (cell.type === 'app.Message') {
        let etiquetaOrigen: string = "";
        let etiquetaDestino: string = "";
        let etiqueta = cell.labels![0].attrs.labelText.text;
        etiqueta = etiqueta.replace(/\n/g, '');
        const origenSource = cell.source!.id;
        const destinoTarget = cell.target!.id;
        dataMapeada.cells.forEach((cell: Cell) => {
          if (cell.type === 'app.Role') {
            if (cell.embeds![0] == origenSource) {
              etiquetaDestino = cell.attrs.label!.text
              etiquetaDestino = etiquetaDestino.replace(/\n/g, '');
            }
          }
        });

        dataMapeada.cells.forEach((cell: Cell) => {
          if (cell.type === 'app.Role') {
            if (cell.embeds![0] == destinoTarget) {
              etiquetaOrigen = cell.attrs.label!.text
              etiquetaOrigen = etiquetaOrigen.replace(/\n/g, '');
            }
          }
        });
        dataEnviarServidor += etiquetaDestino + " " + etiqueta + " de " + etiquetaOrigen + "\n" + "\n";
      }
    });
    dataEnviarServidor = dataNodoDS + "\n" + dataEnviarServidor;
    return dataEnviarServidor;
  }


  public getGraphToCodigo(lenguaje: string) {
    this.textoGraphToCodigo.set(`Convirtiendo Diagrama ${lenguaje}\n Espere por favor ...`);
    let info: string = this.obtenerDataConvert();
    this.serviceDiagrammer.graphTocodigo(lenguaje, info)
      .subscribe((res: GraphToCodigo) => {
        let dataFinal = res.infoCodigo;
        dataFinal = dataFinal.slice(3, -3);
        //this.textoGraphToCodigo.set(dataFinal);
        //console.log(dataFinal);
        const doc = new jsPDF();
        const lineas = doc.splitTextToSize(dataFinal, 180); // Divide el texto en líneas que caben en el ancho de la página
        let y = 10;
        for (let i = 0; i < lineas.length; i++) {
          if (y > 280) { // Si la posición y excede el alto de la página (280 mm), agrega una nueva página
            doc.addPage();
            y = 10; // Restablece la posición y al inicio de la nueva página
          }
          doc.text(lineas[i], 10, y);
          y += 10; // Aumenta la posición y para la siguiente línea
        }
        doc.save(`Codigo${lenguaje}.pdf`);
        this.textoGraphToCodigo.set(`Convierte el Diagrama en Codigo \n Presiona 'Developer' seleccona \n el lenguaje`);
      })
    // const textoLargo = `
    //     Lorem ipsum, dolor sit amet consectetur adipisicing elit. Fugit blanditiis, minima maiores in temporibus veniam quae quos laudantium quod itaque. Possimus enim deserunt consectetur ex dolorem perferendis doloribus pariatur. Laboriosam.
    // Reprehenderit ea, quo voluptas exercitationem iste quas voluptatum temporibus, deserunt provident quisquam blanditiis sunt aspernatur velit molestiae dignissimos facere beatae odit sequi eveniet quidem, dicta tempore magnam quibusdam nemo. Ea!
    // Cum porro, rerum dolorum necessitatibus saepe libero natus nobis ut reprehenderit, tenetur fugit repellendus iste aspernatur. Pariatur facilis iste ullam blanditiis, autem deserunt voluptates, quo consequatur vel placeat laudantium necessitatibus.
    // Ullam commodi asperiores sit ipsa neque ipsam corporis, possimus consequuntur deleniti officiis reiciendis vel amet repudiandae aperiam fuga vero non aut rerum quasi velit minus porro sequi quod dignissimos. Error!
    // Officia cupiditate, cum repudiandae sit, facere perferendis, inventore cumque eius iusto asperiores nobis magnam architecto odit veniam quasi aliquam porro saepe natus tempore sapiente suscipit doloribus quaerat quam? Amet, alias!
    // Eaque ullam consequatur aperiam quas illo delectus ratione obcaecati, optio, nam consequuntur voluptatem labore. Similique ipsum, eligendi architecto explicabo delectus fugiat consectetur soluta magnam error pariatur autem quos provident harum?
    // Iure, explicabo corporis quibusdam neque delectus voluptate eaque eum consequuntur deleniti odio optio incidunt libero accusantium tempore adipisci ipsam ea aliquid fugiat possimus numquam ducimus! Iusto at veritatis inventore. Ipsam.
    // Assumenda, aspernatur fuga? At pariatur vel odit quam eos temporibus iusto illo neque laboriosam reprehenderit perferendis aut similique, delectus vitae provident perspiciatis adipisci. Nostrum sit dolorum impedit, asperiores saepe perferendis.
    // Nemo, asperiores molestias? Nostrum aperiam sit sed pariatur odit debitis commodi rem possimus sint veritatis voluptas, architecto animi accusantium non cumque alias perspiciatis. Dolorem deserunt repudiandae officiis alias assumenda consequatur!
    // Temporibus omnis illo quos, voluptatibus laboriosam ipsum deserunt similique nulla expedita amet numquam. Ab labore asperiores nam voluptatum error saepe blanditiis quas laborum, debitis, doloribus fuga, possimus distinctio. Optio, repellat.
    // Ratione perspiciatis dolorum quibusdam dolor distinctio, quisquam, doloribus sed vel nobis aut dicta quia sit labore quo ducimus! Odio fugiat corporis voluptatibus molestias? Quidem dolorum, labore dolor fugit a praesentium!
    // Veritatis suscipit sint,















    // necessitatibus odit exercitationem nesciunt nobis nisi ea tenetur nostrum rerum, distinctio at quo. Eligendi accusamus corrupti architecto animi ipsa magni totam facere libero officiis placeat, soluta adipisci.
    // Aliquid labore laborum assumenda illum enim vero numquam ratione dolorum, maxime, dolor eos aut! Sit earum numquam et, maxime debitis, incidunt magnam fuga quos facere aspernatur quas, unde aut voluptas.
    // Quod eaque aliquam ea. Molestiae accusantium vitae officiis molestias repudiandae dolores adipisci beatae inventore? Non veniam corrupti at, velit sint quisquam eos voluptatem laborum totam dicta? Est consequatur corporis quos.
    // Consequuntur, nemo, ipsam dolorem architecto corrupti repellat voluptates molestiae minus exercitationem tempore porro? Non fuga quaerat, voluptatem expedita ullam debitis ad quam delectus vero omnis officiis blanditiis iure cumque ipsa?
    // Eligendi possimus asperiores, hic optio dolorum ad architecto blanditiis modi voluptas, omnis dolor. Repudiandae quod cumque non architecto, suscipit id in enim vero excepturi neque, adipisci impedit quas ea labore!
    // Excepturi esse aliquid doloribus enim, repellendus corporis velit adipisci aut perferendis fugiat repudiandae debitis veniam repellat, provident recusandae, vero sunt dolor vitae! Tempore voluptas eum est maxime laudantium blanditiis neque.
    // Aliquam reprehenderit vitae autem modi nostrum minima enim adipisci. Numquam laboriosam nemo sit blanditiis, laudantium inventore accusamus illo. Eius, asperiores totam! Est, culpa consequatur esse quas iste quam voluptatum odio?
    // Fugiat, ipsa. Error iure odit, aperiam repellendus ipsam, in nesciunt reprehenderit corporis ratione minus ut vitae. Reprehenderit odio aut possimus? Voluptas molestias vel necessitatibus nemo reiciendis cum quos nostrum mollitia.
    // Assumenda impedit nisi tenetur perspiciatis. Facere tenetur temporibus repellat laboriosam voluptas ut nisi, sit ipsum vitae repudiandae illo pariatur iste dolorum! Asperiores fugiat, facilis in hic soluta vitae illum fuga.
    // Magni repellat quasi consectetur aspernatur explicabo sint ad unde dicta molestias aliquid rem ratione quo sit praesentium omnis quas odio cum voluptatum impedit, obcaecati ut quibusdam tenetur! Officiis, aut exercitationem!
    // Quae nostrum quas corporis alias a molestias aperiam nihil incidunt non. Minus sapiente libero et ipsam quidem natus, labore quam? Pariatur soluta laboriosam ducimus fuga tempore quisquam assumenda, dolores aspernatur.
    // Corrupti soluta possimus nemo veniam odio aperiam neque labore modi ad, quis laborum sint cum nisi tempora aspernatur nobis, perspiciatis maiores obcaecati assumenda repellendus tempore fugit. Repellat animi autem veritatis!
    // Amet sunt at eaque debitis quaerat quos officia suscipit sint, alias, cumque qui quas, consequatur impedit mollitia cum fuga dicta deserunt repudiandae facere nemo saepe natus. Repellendus, officia reprehenderit. Quasi?
    // Magni placeat, mollitia labore facilis asperiores nesciunt quo suscipit consequuntur ipsa illo quis dolore est repellat nostrum saepe. Itaque doloribus quaerat numquam ut error rerum doloremque ipsa facere aperiam eos!
    // Deleniti quo molestias animi libero, adipisci ipsam rem delectus pariatur facere! Animi perspiciatis officia harum in quas et repellendus doloremque libero atque at consectetur, iste, minima dicta, esse dolores molestiae?
    // Aperiam, neque. Veritatis cum obcaecati maxime, facere numquam distinctio libero vitae cupiditate nisi! Porro nobis laudantium eveniet, natus, animi corrupti voluptatibus distinctio, sapiente dignissimos ipsum voluptas ipsa earum fugit obcaecati.
    // Perspiciatis voluptatum beatae tempora vero dolorem doloremque, aliquid eligendi in hic quod ipsum magnam! At atque, aliquid, pariatur quas delectus expedita perferendis omnis reprehenderit voluptas suscipit officia illum molestias! In.
    // Eligendi dolorum, magnam maxime omnis placeat aut et architecto nesciunt officiis. Perferendis illo eveniet labore harum magnam iusto reprehenderit, molestiae hic ex ipsum ratione! Dolore, odit ratione. Tempora, amet aliquam.
    // Ad repellat veniam quaerat, aut amet itaque repellendus officia voluptatum perferendis rem maiores ipsa similique ullam quod ratione facere libero totam a dignissimos molestiae architecto esse. Minima, explicabo dolorum. Perspiciatis?
    // Optio, voluptate laborum, hic earum mollitia quo in atque reiciendis at laboriosam voluptates natus perferendis esse aperiam dolore quis reprehenderit velit nisi animi delectus nostrum perspiciatis voluptas. Velit, cum beatae!
    // Esse enim nemo alias ad possimus libero eveniet nesciunt tempore optio exercitationem excepturi quasi deserunt illum explicabo harum iste molestiae quam aut ab hic rem debitis, non suscipit eaque! Quaerat.
    // Harum, odit fugit illo deserunt nisi nam vel facilis possimus. Ex, nisi sunt, molestias voluptas maiores voluptatibus doloribus consequuntur earum eos dolores facere laborum cumque optio ipsum adipisci eius. Inventore.
    // Repudiandae sint assumenda dolorum doloribus veritatis maxime doloremque, aspernatur repellat obcaecati! Repellat nisi expedita reprehenderit illum. Sunt cumque beatae nulla eius consequuntur unde cum quam aperiam incidunt, minus, voluptatibus at.
    // Animi expedita consequuntur maiores possimus similique voluptas odit culpa, enim, laboriosam quam hic impedit aspernatur unde pariatur, sit voluptate illum! Ex deserunt incidunt laboriosam odio nesciunt velit consequuntur atque ab.
    // Repudiandae ipsa est, quasi iusto in doloribus quo fuga odit consectetur error sunt culpa asperiores cum! Nemo repudiandae id, eaque nisi impedit doloribus laudantium amet porro culpa fuga cum beatae.
    // Numquam eius, voluptatum dignissimos accusamus, autem aut adipisci est praesentium odit excepturi illum aliquam quod soluta rem? Recusandae commodi aliquam, laudantium quod atque sequi, aliquid eum, dolores illum repudiandae animi!
    // A amet corrupti, doloribus tempore molestias reprehenderit harum consectetur aspernatur aliquid laudantium maxime praesentium voluptatum ullam, dolor, non porro excepturi. Possimus, perferendis! Iusto explicabo odit est? Officiis dicta voluptatibus commodi.
    // Impedit reprehenderit voluptatem officiis architecto cupiditate animi quod nulla laborum illo earum vitae voluptate provident quibusdam placeat, nemo odit cum distinctio deleniti itaque molestiae ex natus quaerat veniam! Pariatur, magnam?
    // Recusandae, molestias nihil dolorum repellat at tempore quidem atque eaque quo? Vero cupiditate quo pariatur minima voluptatum recusandae rem. Enim recusandae fugit quibusdam similique, dignissimos blanditiis repellat. Voluptatem, impedit. Nulla.
    // Similique nulla voluptate animi dignissimos vitae sint iste harum quo quaerat ab quos dolores, ducimus voluptatibus, rerum a sed suscipit cum! Maxime dolor consequatur, quo rem officia doloribus sit libero!
    // Autem dolore qui eos odio a sapiente magnam dicta saepe ea natus! Quas reiciendis modi vero accusantium. Inventore, illo! Nihil ab beatae aperiam facere suscipit cumque fugiat aspernatur veritatis exercitationem.
    // Provident culpa similique esse, eveniet sunt ullam ut reprehenderit asperiores voluptate tenetur veniam nesciunt fuga, est adipisci aliquid itaque veritatis minima, optio obcaecati expedita non. Possimus recusandae obcaecati doloribus ullam?
    // Vitae impedit accusamus reiciendis labore perspiciatis unde numquam perferendis suscipit laborum eum accusantium vel ut veniam aut enim modi quam iste nulla illo praesentium ipsum, quis omnis! Illum, sint nobis.
    // Incidunt, dolores dolorum. Delectus pariatur aperiam nesciunt, ut amet debitis magnam ea, numquam totam fugit doloremque, similique nihil enim veritatis animi illo accusamus? Laboriosam illum sit quis illo commodi magnam!
    // Quia numquam ipsum quae dolorum modi ex veritatis totam id provident, aperiam eum rerum incidunt sequi, perferendis, quaerat dolor? Eum, quia! Eligendi officia corrupti vel, non perferendis fugit reiciendis incidunt.
    // Ipsam eligendi eaque neque, nam maxime quos enim nemo numquam quae iure ad excepturi officia officiis. Id itaque consequatur delectus vel inventore numquam alias rerum, quod sed pariatur veritatis aperiam.
    // Molestiae incidunt veritatis asperiores aperiam totam commodi, magni reiciendis deserunt corporis. Aperiam aspernatur modi nulla explicabo obcaecati quia reiciendis sunt, numquam exercitationem tenetur aut optio animi, iste quae libero officiis.
    // Veniam illo saepe eveniet quas reiciendis in vel, necessitatibus dolor, architecto labore, consectetur corrupti facilis eligendi ratione? Saepe earum consectetur eos beatae ipsam laboriosam. Quod modi rem vero reprehenderit nisi.
    // Deleniti possimus delectus fuga iste ex accusantium veniam, sequi assumenda? Iusto molestias illo rem magnam fugit ut, consequuntur nesciunt numquam nostrum doloribus distinctio ipsa minus itaque adipisci nihil repellendus natus!
    // Facere similique unde a explicabo vero architecto, cumque atque! Enim fugit id nobis expedita, eius inventore a sit provident tempore? Quasi necessitatibus pariatur facere, quos non magni illo nam quo.
    // Nisi eveniet voluptas libero molestiae cumque veniam magni debitis qui nobis consectetur, illo doloremque totam maiores unde quia nulla ullam velit, fugiat, optio sit enim asperiores! In mollitia recusandae reiciendis?
    // Tempore maxime explicabo illum reprehenderit. Maxime totam dolorem perferendis praesentium, quam commodi, veniam rem similique omnis voluptas, vel quisquam nulla placeat voluptate quo illo laboriosam quia eos. Incidunt, eos cum.
    // Vero dolorem debitis, at tenetur non quos, nihil labore laborum alias expedita molestiae mollitia totam officiis possimus saepe perferendis ad a! Repellendus quidem dolore, architecto voluptate quo sequi ad neque!
    // Vero quisquam unde nulla quidem autem quibusdam, delectus omnis numquam voluptas praesentium. Eveniet omnis maiores recusandae similique ducimus culpa aliquam illo praesentium expedita id rem, commodi perspiciatis autem dolorem ipsa!
    // Illum similique laborum tempore amet suscipit atque, voluptates officiis reprehenderit ullam ad ipsum aperiam nulla aliquid, maiores dolorem inventore dolorum. Explicabo corporis quisquam vitae rem labore voluptate obcaecati officia nihil?
    // Molestiae corporis repellendus repudiandae placeat vitae, ipsa quae magnam atque sit est tenetur perferendis dolorem deserunt consectetur laudantium officiis tempore in inventore nulla adipisci obcaecati autem! Adipisci molestiae amet ad?
    // In fugit incidunt pariatur libero minus sequi quis, labore ab quia, velit commodi id voluptate delectus natus placeat, voluptatibus eveniet inventore ex corrupti aspernatur illo! Omnis laboriosam provident eveniet cumque.
    // Reiciendis, expedita placeat consequuntur molestias unde delectus repellendus porro fugiat ut beatae doloribus excepturi aspernatur sequi, animi pariatur voluptate modi iste voluptatum nisi aperiam officia ratione aliquam. Vel, fugit autem.
    // Aspernatur quos, provident eveniet omnis assumenda sit tempora ex quis voluptatibus facilis illum deserunt dolor consectetur culpa nobis officia iure! Enim quae, velit debitis iusto numquam recusandae maxime eum neque.
    // Corporis, quas laboriosam possimus placeat esse odio quidem iste eveniet consequuntur asperiores cupiditate illum maiores? Et unde cum nemo nesciunt odio distinctio illum voluptatem quasi, in, itaque doloremque ratione qui.
    // Officiis praesentium, voluptatem officia pariatur, rerum veniam, cum delectus similique possimus ab illum magni voluptates. Consectetur veritatis tempora, optio commodi cumque explicabo, voluptatibus provident alias veniam recusandae ut nemo unde!
    // Dolor, adipisci. Beatae nam recusandae sed delectus exercitationem possimus vitae doloribus, numquam, natus eligendi ipsam incidunt. Dolores, molestias illo officiis, dolorum iste perspiciatis veritatis libero asperiores at, eveniet deleniti nemo?
    // Eum laboriosam quod est quas rem excepturi, harum quae voluptate, quasi, soluta iure a? Libero impedit qui quae eum, eveniet minus asperiores quibusdam? Beatae ex quas consectetur voluptates quibusdam deleniti.
    // Nemo doloremque provident aut nesciunt excepturi dolores ipsa ipsam, cumque aspernatur, saepe eveniet. Laboriosam, nisi maxime quos, temporibus autem inventore asperiores atque voluptate culpa error vero eligendi quidem aut recusandae?
    // Ea modi cumque enim dolor soluta laboriosam, porro ad, dolorem veritatis ipsum perferendis rem hic facere. Accusantium, numquam eaque distinctio quas quisquam consectetur nam explicabo repellat voluptatum quia ipsam eos.
    // Similique tempore nobis, cumque vel inventore fugit beatae impedit veniam suscipit sint odio distinctio voluptatem, ex id quas! Accusamus, minima. Necessitatibus sit officiis aliquam, facilis quae odit magnam libero at.
    // Fugiat voluptatem ullam repudiandae maxime enim quas maiores at consequuntur quidem sed magnam, saepe minus sequi, porro repellendus quia nesciunt cum. Molestiae placeat dolores nostrum dicta, sapiente enim voluptate necessitatibus!
    // Quisquam, eius commodi ex voluptate quae laborum at inventore saepe error nemo optio soluta ab ducimus recusandae eos? Assumenda, laudantium. Eveniet, explicabo. Ab illo inventore quia commodi nihil assumenda alias?
    // Quos aperiam animi illo sed, sapiente aut dignissimos illum similique. Aspernatur commodi reiciendis ad autem doloremque vel accusamus totam quas porro modi voluptatem velit, vero assumenda officiis eos minima quam!
    // Recusandae, magni. Nostrum accusamus cupiditate quibusdam atque inventore, suscipit facilis assumenda porro repellat, quos doloribus corporis. Obcaecati laboriosam, ducimus numquam unde nostrum eveniet facilis velit impedit porro natus voluptatem nobis.
    // Labore culpa reprehenderit quod ullam modi eaque ratione optio ipsum quasi nesciunt dolores, maiores amet eveniet, minus temporibus. Quibusdam sint iusto quaerat tempore consequatur veritatis nesciunt vero libero et nulla!
    // Consequatur, beatae dolore amet numquam repudiandae magni quisquam iusto dolor ipsam nemo mollitia vitae voluptatum dicta fuga optio labore ex deserunt. Molestias nam saepe inventore quod quas ex in ratione?
    // Commodi cumque harum nisi consectetur, tempora praesentium dolor illo perferendis est, maiores libero deserunt ad reiciendis sapiente suscipit reprehenderit quisquam repellendus illum necessitatibus deleniti ipsum. Voluptatem aliquam nam ad ipsum.
    // Blanditiis ea maiores aliquid ipsa esse repudiandae dolores iste quo architecto nihil consequuntur minus excepturi commodi facilis fugiat facere, quibusdam ab vitae provident aperiam perferendis ad error consequatur tenetur? Saepe!
    // Reprehenderit aut nisi nobis libero ullam voluptates ipsa. Impedit nesciunt placeat facilis nam aliquam repudiandae magnam nihil commodi veniam! Incidunt eum, nobis laudantium provident repudiandae et ex! Ratione, quaerat blanditiis.
    // Voluptas enim cum, nisi quidem aliquid tempora qui odio repudiandae non unde, voluptate laudantium ut earum quas est quis hic excepturi ex officia optio eius soluta consectetur. Rem, recusandae ratione?
    // Eum, rem ea! Sint iste veniam dolorum totam ab, quasi obcaecati eaque excepturi autem explicabo facere assumenda. Aspernatur mollitia rem reiciendis ad at dolore minima, labore delectus vitae laboriosam quasi.
    // Placeat corrupti libero corporis ducimus eligendi facere! Distinctio iusto, inventore ducimus tenetur praesentium explicabo architecto hic, optio voluptas repellendus sunt fugit eos sed! Similique sed in, nobis cumque laborum earum.
    // Quasi necessitatibus hic nemo quas voluptatum ut voluptatem alias expedita sunt amet, repellendus debitis reprehenderit pariatur officiis cumque, beatae vitae maxime? Deserunt cum laborum inventore ab aliquid id dicta porro!
    // Similique sed tempora quaerat excepturi quam architecto magnam molestiae at blanditiis, accusantium voluptas temporibus a illo rerum, quasi impedit cupiditate laudantium vel totam delectus. Quod nesciunt exercitationem deleniti quibusdam eum.
    // Commodi minima officiis ea voluptas cupiditate aperiam beatae repellendus vitae, blanditiis vel voluptatem explicabo a, placeat doloribus ratione, dolores quibusdam fugit quam! Quos eligendi suscipit, sit impedit nulla consequatur dolorem?
    // Iure voluptates, cupiditate debitis commodi fugiat tempore at maiores esse nobis incidunt aspernatur! Cupiditate quis, aspernatur tempore quasi fugit minus ea, officia rem, saepe quibusdam provident perferendis eius eveniet quod.
    // Et atque earum quis, veritatis ab reiciendis voluptate ipsum recusandae maiores tempora perspiciatis mollitia, culpa itaque harum aliquid temporibus dolor ratione voluptas odio eos magnam error! Vero aliquam eaque amet.
    // Deserunt hic voluptatum, dolorem porro ut molestiae eos, repellat reiciendis vero iusto, deleniti impedit adipisci totam blanditiis? Unde omnis laudantium aspernatur, voluptas quidem asperiores in architecto exercitationem deleniti tempora! Molestias.
    // Dolore eum eius perferendis, officiis nulla harum doloribus doloremque reiciendis. Enim ducimus dolorum consequuntur sint corporis ipsa nulla vitae esse aut animi, quas suscipit iusto aliquid nostrum, debitis fugit ratione.
    // Facilis, commodi modi molestias rem, voluptatem velit dolorum ipsam numquam minima assumenda ratione illum! Ratione dolorum deserunt earum consectetur cum ut, aspernatur quos reiciendis, nostrum harum placeat aliquam, natus eveniet!
    // Asperiores deserunt, vero fugiat delectus doloremque ab quasi, dolor inventore sapiente expedita hic velit. Expedita recusandae, voluptatibus provident quis harum repellat voluptatum consectetur similique vel quod est consequuntur animi deserunt.
    // Dolorum nemo saepe illo quod, iusto vitae impedit rerum temporibus praesentium incidunt ipsam neque sed adipisci quas exercitationem porro placeat magnam cupiditate, facere excepturi a itaque. Eum, atque. Esse, modi.
    // Illo quam, voluptatum rem nemo saepe, voluptatem autem nostrum exercitationem modi expedita sit velit, veritatis impedit. Veniam tenetur eos, doloremque ex cumque qui eius minima ullam praesentium magni impedit sed.
    // Consequuntur sequi impedit rerum tempora neque natus delectus perspiciatis eveniet aspernatur labore ea, quas distinctio? Officiis amet quod vero quisquam dicta maxime nihil ab porro ea eum. Labore, tenetur non!
    // Inventore commodi a accusamus provident blanditiis animi quo, reprehenderit excepturi id, eos possimus officia iste, eligendi veritatis suscipit deserunt. Voluptatum distinctio quis aut magnam, possimus adipisci voluptas perferendis inventore accusamus?
    // Numquam magni iste totam modi odio illum blanditiis deleniti. Perspiciatis facere recusandae, quae cupiditate porro non magni ex. Porro reprehenderit asperiores dolor! Fuga accusantium deleniti qui expedita, accusamus quisquam ipsa.
    // Tempore odio odit rerum porro natus! Consequatur eius deserunt sint quia sunt. Amet, eveniet eligendi neque soluta, corrupti delectus quia consequuntur tempore eaque quae ipsam atque sunt! Itaque, exercitationem iusto!
    // Magnam eaque blanditiis similique cum quasi nobis autem maiores doloremque impedit atque. Dolores repellat magni nemo quia nihil quos illum modi vitae, itaque doloremque ullam et ipsum, accusantium, neque sed!
    // Quasi officiis totam dolor vitae, corrupti explicabo possimus commodi aliquid molestiae deleniti alias fuga consectetur accusantium maxime, aut eaque repellat labore! Sunt fuga a impedit amet tempore corporis, sequi eaque?
    // Aperiam placeat odio perspiciatis accusantium, veniam excepturi deserunt. Quaerat quasi ea est consequatur ex nesciunt illum dolorem aspernatur cupiditate maxime, quae atque voluptatem recusandae dolor possimus repudiandae molestias. Vel, sint?
    // Ut voluptas deleniti sint non explicabo nulla quae nemo quas perspiciatis fuga neque reprehenderit placeat optio fugiat asperiores exercitationem molestiae laborum itaque rem, similique minus, debitis quo. Voluptate, cumque culpa.
    // Eligendi vitae odit officia nihil quisquam distinctio repellat dolor ea. Possimus cumque illum nostrum exercitationem, nesciunt odit alias. Dicta a repellendus beatae pariatur est culpa esse ad eligendi iure animi!
    // Tempore molestias at eos hic cum sequi rem, iste maiores. Similique impedit facilis, at distinctio magni eum atque? Ut reiciendis possimus sapiente, in accusamus nesciunt? Corrupti libero quibusdam officia expedita!



    //     `;
  }

  public salirSala() {
    this.router.navigate(['/home']);
  }
}

