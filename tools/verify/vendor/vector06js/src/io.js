"use strict";

/** @constructor */
function IO(keyboard, timer, kvaz, ay, fdc, tape_player) {
    this.iff = false;
    this.Palette = new Uint32Array(16);
    this.keyboard = keyboard;
    this.Timer = timer;
    this.Kvaz = kvaz;
    this.fdc = fdc;
    this.ay = ay;
    // Заглушка на случай, когда IO создают без магнитофона (headless-пробы
    // портов Humphrey так и делают): чтение порта 0x01 берёт бит 4 из ленты,
    // и без неё безобидный IN валит весь прогон.
    this.tape_player = tape_player || { sample: 0 };
    this.onmodechange = function(mode) {};
    this.onborderchange = function(border) {};
    this.ontapeoutchange = function(tape) {};
    this.onruslat = function(on) {};

    this.CW = 0x98;
    this.PA = 0xff;
    this.PB = 0xff;
    this.PC = 0xff;
    this.PIA1_last = 0;
    this.CW2 = 0;
    this.PA2 = 0xff;
    this.PB2 = 0xff;
    this.PC2 = 0xff;
    this.outport = undefined;
    this.outbyte = undefined;
    this.palettebyte = undefined;
    
    // make sure that palette has alpha=255
    for (var i = 0; i < 16; i++) {
        this.Palette[i] = 0xff000000;
    }
}

IO.prototype.input = function(port) {
    var result = 0xff;
    switch (port) {
        case 0x00:
            // No read operation of the control word register is allowed
            result = this.PIA1_last; // but life is not a paragraph)
            break;
        case 0x01:
            //if (this.CW & 0x80 === 0) { // BSR
            //    result = this.PC;
            //} else 
            {     /* PC.low in  ? */
                var pclow = (this.CW & 0x01) ? 0x0b : (this.PC & 0x0f);
                         /* PC.high in ? */
                var pcupp = (this.CW & 0x08) ? 
                        (((this.tape_player.sample & 1) << 4) |
                        (this.keyboard.ss ? 0 : (1 << 5)) |
                        (this.keyboard.us ? 0 : (1 << 6)) |
                        (this.keyboard.rus ? 0 : (1 << 7))) : (this.PC & 0xf0);
                result = pclow | pcupp;
            }
            break;
        case 0x02:
            if ((this.CW & 0x02) !== 0) {
                result = this.keyboard.Read(~this.PA); // input
            } else {
                result = this.PB;       // output
            }
            break;
        case 0x03:
            if ((this.CW & 0x10) === 0) {
                result = this.PA;       // output
            } else {
                result = 0xff;          // input
            }
            break;

        case 0x0e:
            // Vector joystick A port (real HW: separate 8255 chip, joyA_o in the
            // MiSTer core's Vector-06C.sv/k580vv55.v -- NOT the keyboard-matrix
            // 8255 that also carries the video mode512 bit, see reference_vector06c_
            // palette_latch).  Active-low on the wire.
            //
            // РАСКЛАДКА СТРОГО ПО RTL (Vector-06C.sv:635):
            //   joyA_o = ~{joyA[5], joyA[4], 2'b00, joyA[2], joyA[3], joyA[1], joyA[0]}
            // то есть bit0=RIGHT bit1=LEFT bit2=UP bit3=DOWN bit6=FIRE1 bit7=FIRE2,
            // а БИТЫ 4 И 5 ЗАБИТЫ В ЕДИНИЦУ — кнопок там нет.  Раньше здесь были
            // выдуманные кнопки на битах 0x20/0x10; порт Humphrey вешал на них
            // выбор «Teclado» и отладочную смену уровня, и на живом MiSTer они
            // молчали (меню не проходилось).  Не возвращать.
            //
            // Источник — биты матрицы (row0 стрелки, row7 пробел, row6 бит7 = W),
            // чтобы браузерные стрелки/пробел работали без обёртки на странице.
            {
                var jbits = ((this.keyboard.matrix[0] & 0x40) ? 0x01 : 0) |  // Right (kc 39)
                            ((this.keyboard.matrix[0] & 0x10) ? 0x02 : 0) |  // Left  (kc 37)
                            ((this.keyboard.matrix[0] & 0x20) ? 0x04 : 0) |  // Up    (kc 38)
                            ((this.keyboard.matrix[0] & 0x80) ? 0x08 : 0) |  // Down  (kc 40)
                            ((this.keyboard.matrix[7] & 0x80) ? 0x40 : 0) |   // Fire1 (Space)
                            ((this.keyboard.matrix[6] & 0x80) ? 0x80 : 0);    // Fire2 (клавиша W)
                result = (~jbits) & 0xff;
            }
            break;

        case 0x04:
            result = this.CW2;
            break;
        case 0x05:
            result = this.PC2;
            break;
        case 0x06:
            result = this.PB2;
            break;
        case 0x07:
            result = this.PA2;
            break;

            // Timer
        case 0x08:
        case 0x09:
        case 0x0a:
        case 0x0b:
            return this.Timer.Read(~(port & 3));

        case 0x14:
        case 0x15:
            result = window._noay ? 0xff : this.ay.read(port & 1);
            break;

        case 0x18: // fdc data
            result = this.fdc.read(3);
            break;
        case 0x19: // fdc sector
            result = this.fdc.read(2);
            break;
        case 0x1a: // fdc track
            result = this.fdc.read(1);
            break;
        case 0x1b: // fdc status
            result = this.fdc.read(0);
            break;
        case 0x1c: // fdc control - readonly
            //result = this.fdc.read(4);
            break;
        default:
            break;
    }
    return result;
};

IO.prototype.output = function(port, w8) {
    this.outport = port;
    this.outbyte = w8;

    /* debug print from guest */
    switch (port) {
        case 0x77:  
                this.str1 += w8.toString(16) + " ";
                break;
        case 0x79:
                if (w8 != 0) {
                    this.str1 += String.fromCharCode(w8);
                } else {
                    console.log(this.str1);
                    this.str1 = "";
                }
                
    }
};

IO.prototype.realoutput = function(port, w8) {
    var ruslat;
    switch (port) {
        // PIA 
        case 0x00:
            this.PIA1_last = w8;
            ruslat = this.PC & 8;
            if ((w8 & 0x80) === 0) {
                // port C BSR: 
                //   bit 0: 1 = set, 0 = reset
                //   bit 1-3: bit number
                var bit = (w8 >> 1) & 7;
                if ((w8 & 1) === 1) {
                    this.PC |= 1 << bit;
                } else {
                    this.PC &= ~(1 << bit);
                }
                this.ontapeoutchange(this.PC & 1);
            } else {
                this.CW = w8;
                this.realoutput(1, 0);
                this.realoutput(2, 0);
                this.realoutput(3, 0);
            }
            if (((this.PC & 8) != ruslat) && this.onruslat) {
                this.onruslat((this.PC & 8) === 0);
            }
            // if (debug) {
            //     console.log("output commit cw = ", this.CW.toString(16));
            // }
            break;
        case 0x01:
            this.PIA1_last = w8;
            ruslat = this.PC & 8;
            this.PC = w8;
            this.ontapeoutchange(this.PC & 1);
            if (((this.PC & 8) != ruslat) && this.onruslat) {
                this.onruslat((this.PC & 8) === 0);
            }
            break;
        case 0x02:
            this.PIA1_last = w8;
            this.PB = w8;
            this.onborderchange(this.PB & 0x0f);
            this.onmodechange((this.PB & 0x10) !== 0);
            break;
        case 0x03:
            this.PIA1_last = w8;
            this.PA = w8;
            break;
            // PPI2
        case 0x04:
            this.CW2 = w8;
            break;
        case 0x05:
            this.PC2 = w8;
            break;
        case 0x06:
            this.PB2 = w8;
            break;
        case 0x07:
            this.PA2 = w8;
            break;

            // Timer
        case 0x08:
        case 0x09:
        case 0x0a:
        case 0x0b:
            this.Timer.Write((~port & 3), w8);
            break;

        case 0x0c:
        case 0x0d:
        case 0x0e:
        case 0x0f:
            this.palettebyte = w8;
            break;
        case 0x10:
            // kvas 
            this.Kvaz.control_write(w8);
            break;
        case 0x14:
        case 0x15:
            if (!window._noay) this.ay.write(port & 1, w8);
            break;

        case 0x18: // fdc data
            this.fdc.write(3, w8);
            break;
        case 0x19: // fdc sector
            this.fdc.write(2, w8);
            break;
        case 0x1a: // fdc track
            this.fdc.write(1, w8);
            break;
        case 0x1b: // fdc command
            this.fdc.write(0, w8);
            break;
        case 0x1c: // fdc control
            this.fdc.write(4, w8);
            break;
        default:
            break;
    }
};

IO.prototype.commit = function() {
    if (this.outport !== undefined) {
        this.realoutput(this.outport, this.outbyte);
        this.outport = this.outbyte = undefined;
    }
};

IO.prototype.commit_palette = function(index) {
    var w8 = this.palettebyte;
    if (w8 === undefined && this.outport === 0x0c) {
        w8 = this.outbyte;
        this.outport = this.outbyte = undefined;
    }
    if (w8 !== undefined) {
        var b = (w8 & 0xc0) >> 6;
        var g = (w8 & 0x38) >> 3;
        var r = (w8 & 0x07);
        this.Palette[index] =
            0xff000000 |
            (b << (6 + 16)) |
            (g << (5 + 8)) |
            (r << (5 + 0));
        this.palettebyte = undefined;
    }
};

IO.prototype.interrupt = function(iff) {
    this.iff = iff;
};

IO.prototype.BorderIndex = function() {
    return this.PB & 0x0f;
};

IO.prototype.ScrollStart = function() {
    return this.PA;
};

IO.prototype.Mode512 = function() {
    return (this.PB & 0x10) !== 0;
};

IO.prototype.TapeOut = function() {
    return this.PC & 1;
};
